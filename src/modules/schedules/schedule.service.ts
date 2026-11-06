import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  HO_CHI_MINH_TZ,
  formatDateVN,
  formatIsoDateOnly,
  formatTimeVN,
  todayDateStringVN,
} from "@/lib/date";
import {
  AppForbiddenError,
  AppNotFoundError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import {
  addDaysToDateString,
  buildShiftInterval,
  listWeekDates,
  netShiftMinutes,
} from "@/lib/shift-time";
import { parseOrThrow } from "@/lib/validation";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { createNotifications } from "@/modules/notifications/notification.service";
import { loadSettingsBundle } from "@/modules/settings/settings.service";
import { recordScheduleRevision, SCHEDULE_STATUS_LABELS } from "./schedule-lifecycle";
import { scheduleRepository } from "./schedule.repository";
import type {
  MyWeekScheduleDto,
  ScheduleDetailDto,
  ScheduleListItemDto,
  ScheduleRevisionDto,
  ScheduleStatusAction,
} from "./schedule.types";
import {
  createScheduleSchema,
  scheduleStatusActionSchema,
  weekStartSchema,
  type CreateScheduleInput,
} from "./schedule.validation";

function todayLocal(): string {
  return todayDateStringVN();
}

export function computeAvailabilityDeadline(weekStart: string, leadDays: number): Date {
  return fromZonedTime(
    `${addDaysToDateString(weekStart, -leadDays)}T00:00:00`,
    HO_CHI_MINH_TZ,
  );
}

const OFFICIAL_STATUSES = ["PUBLISHED", "LOCKED", "ARCHIVED"] as const;

export const scheduleService = {
  async getWeek(actor: SessionUser, weekStart: string): Promise<ScheduleDetailDto | null> {
    assertPermission(actor.role, "schedules:read");
    const week = parseOrThrow(weekStartSchema, weekStart);
    const schedule = await scheduleRepository.findByWeekStart(week);
    return schedule ? scheduleRepository.toDetailDto(schedule) : null;
  },

  async getById(actor: SessionUser, id: string): Promise<ScheduleDetailDto> {
    assertPermission(actor.role, "schedules:read");
    const schedule = await scheduleRepository.findById(id);
    if (!schedule) {
      throw new AppNotFoundError("Không tìm thấy lịch tuần");
    }
    return scheduleRepository.toDetailDto(schedule);
  },

  async listRecent(actor: SessionUser, limit = 12): Promise<ScheduleListItemDto[]> {
    assertPermission(actor.role, "schedules:read");
    const rows = await prisma.schedule.findMany({
      orderBy: { weekStart: "desc" },
      take: limit,
      include: {
        _count: { select: { shifts: { where: { status: { not: "CANCELLED" } } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      weekStart: formatIsoDateOnly(r.weekStart),
      status: r.status,
      shiftCount: r._count.shifts,
    }));
  },

  /** Creates a DRAFT schedule for a week, optionally generating shifts from active templates. */
  async createWeek(actor: SessionUser, rawInput: CreateScheduleInput): Promise<ScheduleDetailDto> {
    assertPermission(actor.role, "schedules:manage");
    const data = parseOrThrow(createScheduleSchema, rawInput, "Dữ liệu lịch tuần không hợp lệ");

    const existing = await prisma.schedule.findUnique({
      where: { weekStart: new Date(`${data.weekStart}T00:00:00.000Z`) },
      select: { id: true },
    });
    if (existing) {
      throw new AppValidationError(
        `Lịch tuần bắt đầu ${formatDateVN(data.weekStart)} đã tồn tại`,
      );
    }

    const settings = await loadSettingsBundle();
    const templates = data.generateFromTemplates
      ? await prisma.shiftTemplate.findMany({
          where: { isActive: true },
          include: { positionRequirements: true },
          orderBy: [{ startTime: "asc" }, { priority: "asc" }],
        })
      : [];

    const scheduleId = await prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.create({
        data: {
          weekStart: new Date(`${data.weekStart}T00:00:00.000Z`),
          name: data.name?.length ? data.name : `Lịch tuần ${formatDateVN(data.weekStart)}`,
          status: "DRAFT",
          availabilityDeadline: computeAvailabilityDeadline(
            data.weekStart,
            Number(settings.schedulingPolicy.availabilityLeadDays),
          ),
        },
      });

      for (const date of listWeekDates(data.weekStart)) {
        for (const tpl of templates) {
          const { startAt, endAt } = buildShiftInterval(date, tpl.startTime, tpl.endTime);
          await tx.shift.create({
            data: {
              scheduleId: schedule.id,
              templateId: tpl.id,
              name: tpl.name,
              workDate: new Date(`${date}T00:00:00.000Z`),
              startAt,
              endAt,
              breakMinutes: tpl.breakMinutes,
              requiredStaff: tpl.minStaff,
              maxStaff: tpl.maxStaff,
              priority: tpl.priority,
              isPeak: tpl.isPeak,
              status: "OPEN",
              positionRequirements: {
                create: tpl.positionRequirements.map((r) => ({
                  positionId: r.positionId,
                  minCount: r.minCount,
                  maxCount: r.maxCount,
                })),
              },
            },
          });
        }
      }

      await recordScheduleRevision(tx, {
        scheduleId: schedule.id,
        actorUserId: actor.userId,
        action: "CREATED",
        summary: `Tạo lịch nháp với ${templates.length * 7} ca từ ${templates.length} ca mẫu`,
      });
      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SCHEDULE_CREATED",
          entityType: "Schedule",
          entityId: schedule.id,
          newValues: { weekStart: data.weekStart, shiftCount: templates.length * 7 },
        },
        tx,
      );
      return schedule.id;
    });

    return this.getById(actor, scheduleId);
  },

  async changeStatus(
    actor: SessionUser,
    scheduleId: string,
    rawInput: { action: ScheduleStatusAction } | unknown,
  ): Promise<ScheduleDetailDto> {
    assertPermission(actor.role, "schedules:manage");
    const { action } = parseOrThrow(scheduleStatusActionSchema, rawInput);

    await prisma.$transaction(async (tx) => {
      // Row lock prevents concurrent status transitions on the same schedule.
      await tx.$executeRaw`SELECT id FROM schedules WHERE id = ${scheduleId}::uuid FOR UPDATE`;
      const schedule = await tx.schedule.findUnique({
        where: { id: scheduleId },
        include: {
          shifts: {
            where: { status: { not: "CANCELLED" } },
            include: { assignments: { where: { status: "ASSIGNED" } } },
          },
        },
      });
      if (!schedule) {
        throw new AppNotFoundError("Không tìm thấy lịch tuần");
      }

      const weekStart = formatIsoDateOnly(schedule.weekStart);
      const now = new Date();
      let summary = "";

      switch (action) {
        case "PUBLISH": {
          if (schedule.status !== "DRAFT") {
            throw new AppValidationError("Chỉ có thể công bố lịch đang ở trạng thái Bản nháp");
          }
          if (schedule.shifts.length === 0) {
            throw new AppValidationError("Lịch tuần chưa có ca làm nào để công bố");
          }
          const understaffed = schedule.shifts.filter(
            (s) => s.assignments.length < s.requiredStaff,
          ).length;
          await tx.schedule.update({
            where: { id: scheduleId },
            data: { status: "PUBLISHED", publishedAt: now, publishedById: actor.userId },
          });
          summary =
            understaffed > 0
              ? `Công bố lịch (còn ${understaffed} ca thiếu người)`
              : "Công bố lịch chính thức";

          const employeeIds = [
            ...new Set(schedule.shifts.flatMap((s) => s.assignments.map((a) => a.employeeId))),
          ];
          const employees = await tx.employee.findMany({
            where: { id: { in: employeeIds } },
            select: { id: true, userId: true },
          });
          await createNotifications(
            tx,
            employees.map((e) => {
              const count = schedule.shifts.filter((s) =>
                s.assignments.some((a) => a.employeeId === e.id),
              ).length;
              return {
                userId: e.userId,
                type: "SCHEDULE_PUBLISHED" as const,
                title: `Đã có lịch làm tuần ${formatDateVN(weekStart)}`,
                message: `Bạn được xếp ${count} ca trong tuần này.`,
                linkUrl: `/employee/schedule?week=${weekStart}`,
              };
            }),
          );
          break;
        }
        case "LOCK": {
          if (schedule.status !== "PUBLISHED") {
            throw new AppValidationError("Chỉ có thể khóa lịch đã công bố");
          }
          await tx.schedule.update({
            where: { id: scheduleId },
            data: { status: "LOCKED", lockedAt: now, lockedById: actor.userId },
          });
          summary = "Khóa lịch tuần, không cho phép chỉnh sửa";
          break;
        }
        case "UNLOCK": {
          if (actor.role !== "OWNER") {
            throw new AppForbiddenError("Chỉ chủ quán được mở khóa lịch tuần");
          }
          if (schedule.status !== "LOCKED") {
            throw new AppValidationError("Lịch tuần không ở trạng thái Đã khóa");
          }
          await tx.schedule.update({
            where: { id: scheduleId },
            data: { status: "PUBLISHED", lockedAt: null, lockedById: null },
          });
          summary = "Mở khóa lịch tuần để chỉnh sửa";
          break;
        }
        case "ARCHIVE": {
          if (schedule.status !== "PUBLISHED" && schedule.status !== "LOCKED") {
            throw new AppValidationError("Chỉ lưu trữ được lịch đã công bố hoặc đã khóa");
          }
          if (addDaysToDateString(weekStart, 6) >= todayLocal()) {
            throw new AppValidationError("Chỉ lưu trữ được lịch của các tuần đã kết thúc");
          }
          await tx.schedule.update({
            where: { id: scheduleId },
            data: { status: "ARCHIVED" },
          });
          summary = "Lưu trữ lịch tuần";
          break;
        }
      }

      await recordScheduleRevision(tx, {
        scheduleId,
        actorUserId: actor.userId,
        action,
        summary,
      });
      await recordAuditLog(
        {
          userId: actor.userId,
          action: `SCHEDULE_${action}`,
          entityType: "Schedule",
          entityId: scheduleId,
          oldValues: { status: schedule.status },
          newValues: { summary },
        },
        tx,
      );
    });

    return this.getById(actor, scheduleId);
  },

  async listRevisions(actor: SessionUser, scheduleId: string): Promise<ScheduleRevisionDto[]> {
    assertPermission(actor.role, "schedules:read");
    const rows = await prisma.scheduleRevision.findMany({
      where: { scheduleId },
      orderBy: { revisionNumber: "desc" },
      include: {
        changedBy: { select: { email: true, employee: { select: { fullName: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      revisionNumber: r.revisionNumber,
      action: r.action,
      summary: r.summary,
      changedByName: r.changedBy?.employee?.fullName ?? r.changedBy?.email ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  /** Employee view: only official (published/locked/archived) schedules are visible. */
  async getMyWeek(actor: SessionUser, weekStart: string): Promise<MyWeekScheduleDto> {
    assertPermission(actor.role, "self:schedule");
    const week = parseOrThrow(weekStartSchema, weekStart);
    const empty: MyWeekScheduleDto = {
      weekStart: week,
      weekEnd: addDaysToDateString(week, 6),
      scheduleStatus: null,
      shifts: [],
      totalMinutes: 0,
    };
    if (!actor.employeeId) {
      return empty;
    }

    const schedule = await prisma.schedule.findUnique({
      where: { weekStart: new Date(`${week}T00:00:00.000Z`) },
      select: { id: true, status: true },
    });
    if (!schedule || !(OFFICIAL_STATUSES as readonly string[]).includes(schedule.status)) {
      return empty;
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        employeeId: actor.employeeId,
        status: "ASSIGNED",
        shift: { scheduleId: schedule.id, status: { not: "CANCELLED" } },
      },
      orderBy: { shift: { startAt: "asc" } },
      include: {
        position: { select: { name: true } },
        shift: {
          include: {
            assignments: {
              where: { status: "ASSIGNED", employeeId: { not: actor.employeeId } },
              include: { employee: { select: { fullName: true } } },
            },
          },
        },
      },
    });

    const shifts = assignments.map((a) => ({
      assignmentId: a.id,
      shiftId: a.shiftId,
      shiftName: a.shift.name,
      workDate: formatIsoDateOnly(a.shift.workDate),
      startTime: formatTimeVN(a.shift.startAt),
      endTime: formatTimeVN(a.shift.endAt),
      startAt: a.shift.startAt.toISOString(),
      endAt: a.shift.endAt.toISOString(),
      breakMinutes: a.shift.breakMinutes,
      netMinutes: netShiftMinutes(a.shift.startAt, a.shift.endAt, a.shift.breakMinutes),
      positionName: a.position.name,
      coworkers: a.shift.assignments.map((c) => c.employee.fullName),
    }));

    return {
      ...empty,
      scheduleStatus: schedule.status,
      shifts,
      totalMinutes: shifts.reduce((sum, s) => sum + s.netMinutes, 0),
    };
  },
};

export { SCHEDULE_STATUS_LABELS };
