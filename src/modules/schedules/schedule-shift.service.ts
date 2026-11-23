import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { formatDateVN, formatIsoDateOnly, formatTimeVN } from "@/lib/date";
import { AppNotFoundError, AppValidationError, assertPermission } from "@/lib/permissions";
import { addDaysToDateString, buildShiftInterval } from "@/lib/shift-time";
import { parseOrThrow } from "@/lib/validation";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { invalidateDashboardCache } from "@/modules/dashboard/dashboard.service";
import { evaluateAssignment } from "./conflict-detector";
import { loadAssignmentContexts } from "./assignment-context";
import {
  assertScheduleEditable,
  notifyScheduleChange,
  recordScheduleRevision,
  refreshShiftStatus,
} from "./schedule-lifecycle";
import {
  createShiftSchema,
  updateShiftSchema,
  type CreateShiftInput,
  type UpdateShiftInput,
} from "./schedule.validation";

type Tx = Prisma.TransactionClient;

function assertWithinWeek(workDate: string, weekStart: string): void {
  if (workDate < weekStart || workDate > addDaysToDateString(weekStart, 6)) {
    throw new AppValidationError(
      `Ngày làm ${formatDateVN(workDate)} không thuộc tuần ${formatDateVN(weekStart)}`,
    );
  }
}

function toInterval(workDate: string, startTime: string, endTime: string) {
  try {
    return buildShiftInterval(workDate, startTime, endTime);
  } catch (err) {
    throw new AppValidationError(err instanceof Error ? err.message : "Giờ ca không hợp lệ");
  }
}

async function loadShiftForEdit(tx: Tx, shiftId: string) {
  const shift = await tx.shift.findUnique({
    where: { id: shiftId },
    include: {
      schedule: true,
      assignments: { where: { status: "ASSIGNED" } },
    },
  });
  if (!shift) {
    throw new AppNotFoundError("Không tìm thấy ca làm");
  }
  assertScheduleEditable(shift.schedule.status);
  return shift;
}

export const scheduleShiftService = {
  async createShift(actor: SessionUser, scheduleId: string, rawInput: CreateShiftInput) {
    assertPermission(actor.role, "schedules:manage");
    const data = parseOrThrow(createShiftSchema, rawInput, "Dữ liệu ca làm không hợp lệ");

    const result = await prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.findUnique({ where: { id: scheduleId } });
      if (!schedule) {
        throw new AppNotFoundError("Không tìm thấy lịch tuần");
      }
      assertScheduleEditable(schedule.status);
      const weekStart = formatIsoDateOnly(schedule.weekStart);
      assertWithinWeek(data.workDate, weekStart);
      const { startAt, endAt } = toInterval(data.workDate, data.startTime, data.endTime);
      if (data.breakMinutes * 60000 >= endAt.getTime() - startAt.getTime()) {
        throw new AppValidationError("Thời gian nghỉ phải nhỏ hơn thời lượng ca");
      }

      const shift = await tx.shift.create({
        data: {
          scheduleId,
          templateId: data.templateId ?? null,
          name: data.name,
          workDate: new Date(`${data.workDate}T00:00:00.000Z`),
          startAt,
          endAt,
          breakMinutes: data.breakMinutes,
          requiredStaff: data.requiredStaff,
          maxStaff: data.maxStaff ?? null,
          isPeak: data.isPeak,
          notes: data.notes ?? null,
          status: "OPEN",
          positionRequirements: {
            create: data.positionRequirements
              .filter((r) => r.minCount > 0)
              .map((r) => ({
                positionId: r.positionId,
                minCount: r.minCount,
                maxCount: r.maxCount ?? null,
              })),
          },
        },
      });

      const summary = `Thêm ${data.name} ngày ${formatDateVN(data.workDate)} (${data.startTime}–${data.endTime})`;
      await recordScheduleRevision(tx, {
        scheduleId,
        actorUserId: actor.userId,
        action: "SHIFT_CREATED",
        summary,
      });
      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SHIFT_CREATED",
          entityType: "Shift",
          entityId: shift.id,
          newValues: { scheduleId, workDate: data.workDate, name: data.name },
        },
        tx,
      );
      return { id: shift.id };
    });
    invalidateDashboardCache();
    return result;
  },

  async updateShift(actor: SessionUser, shiftId: string, rawInput: UpdateShiftInput) {
    assertPermission(actor.role, "schedules:manage");
    const data = parseOrThrow(updateShiftSchema, rawInput, "Dữ liệu ca làm không hợp lệ");

    const result = await prisma.$transaction(async (tx) => {
      const shift = await loadShiftForEdit(tx, shiftId);
      if (shift.status === "CANCELLED") {
        throw new AppValidationError("Ca đã bị hủy, không thể chỉnh sửa");
      }
      const weekStart = formatIsoDateOnly(shift.schedule.weekStart);
      const workDate = data.workDate ?? formatIsoDateOnly(shift.workDate);
      assertWithinWeek(workDate, weekStart);

      const startTime = data.startTime ?? formatTimeVN(shift.startAt);
      const endTime = data.endTime ?? formatTimeVN(shift.endAt);
      const { startAt, endAt } = toInterval(workDate, startTime, endTime);
      const breakMinutes = data.breakMinutes ?? shift.breakMinutes;
      const requiredStaff = data.requiredStaff ?? shift.requiredStaff;
      const maxStaff = data.maxStaff === undefined ? shift.maxStaff : data.maxStaff;
      if (breakMinutes * 60000 >= endAt.getTime() - startAt.getTime()) {
        throw new AppValidationError("Thời gian nghỉ phải nhỏ hơn thời lượng ca");
      }
      if (maxStaff !== null && maxStaff < requiredStaff) {
        throw new AppValidationError("Số nhân sự tối đa phải lớn hơn hoặc bằng số yêu cầu");
      }

      const timeChanged =
        startAt.getTime() !== shift.startAt.getTime() ||
        endAt.getTime() !== shift.endAt.getTime();

      if (timeChanged && shift.assignments.length > 0) {
        const contexts = await loadAssignmentContexts(tx, {
          shift: {
            id: shift.id,
            name: shift.name,
            templateId: shift.templateId,
            workDate: new Date(`${workDate}T00:00:00.000Z`),
            startAt,
            endAt,
            breakMinutes,
          },
          weekStart,
          employeeIds: shift.assignments.map((a) => a.employeeId),
        });
        const blocked: string[] = [];
        for (const a of shift.assignments) {
          const ctx = contexts.get(a.employeeId);
          if (!ctx) continue;
          const result = evaluateAssignment({ ...ctx.base, positionId: a.positionId });
          const blocking = result.conflicts.filter((c) => c.severity === "BLOCKING");
          if (blocking.length > 0) {
            blocked.push(`${ctx.fullName}: ${blocking.map((c) => c.message).join("; ")}`);
          }
        }
        if (blocked.length > 0) {
          throw new AppValidationError(
            `Không thể đổi giờ ca vì gây xung đột cho nhân viên đã phân công — ${blocked.join(" | ")}`,
          );
        }
      }

      await tx.shift.update({
        where: { id: shiftId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.isPeak !== undefined ? { isPeak: data.isPeak } : {}),
          workDate: new Date(`${workDate}T00:00:00.000Z`),
          startAt,
          endAt,
          breakMinutes,
          requiredStaff,
          maxStaff,
        },
      });

      if (data.positionRequirements !== undefined) {
        await tx.shiftPositionRequirement.deleteMany({ where: { shiftId } });
        const reqs = data.positionRequirements.filter((r) => r.minCount > 0);
        if (reqs.length > 0) {
          await tx.shiftPositionRequirement.createMany({
            data: reqs.map((r) => ({
              shiftId,
              positionId: r.positionId,
              minCount: r.minCount,
              maxCount: r.maxCount ?? null,
            })),
          });
        }
      }
      await refreshShiftStatus(tx, shiftId);

      const summary = `Cập nhật ${data.name ?? shift.name} ngày ${formatDateVN(workDate)} (${startTime}–${endTime})`;
      await recordScheduleRevision(tx, {
        scheduleId: shift.scheduleId,
        actorUserId: actor.userId,
        action: "SHIFT_UPDATED",
        summary,
      });
      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SHIFT_UPDATED",
          entityType: "Shift",
          entityId: shiftId,
          oldValues: {
            workDate: formatIsoDateOnly(shift.workDate),
            startAt: shift.startAt.toISOString(),
            endAt: shift.endAt.toISOString(),
            requiredStaff: shift.requiredStaff,
          },
          newValues: {
            workDate,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            requiredStaff,
          },
        },
        tx,
      );
      if (timeChanged) {
        await notifyScheduleChange(tx, {
          status: shift.schedule.status,
          weekStart: shift.schedule.weekStart,
          employeeIds: shift.assignments.map((a) => a.employeeId),
          detail: `${shift.name} đổi sang ${formatDateVN(workDate)} ${startTime}–${endTime}`,
        });
      }
      return { id: shiftId };
    });
    invalidateDashboardCache();
    return result;
  },

  /**
   * Never-published schedules: hard delete. Published schedules: cancel the
   * shift and remove its assignments so history stays intact.
   */
  async deleteShift(actor: SessionUser, shiftId: string) {
    assertPermission(actor.role, "schedules:manage");

    const result = await prisma.$transaction(async (tx) => {
      const shift = await loadShiftForEdit(tx, shiftId);
      const label = `${shift.name} ngày ${formatDateVN(shift.workDate)}`;
      const affected = shift.assignments.map((a) => a.employeeId);
      const hardDelete = shift.schedule.publishedAt === null;

      if (hardDelete) {
        await tx.shift.delete({ where: { id: shiftId } });
      } else {
        await tx.shiftAssignment.updateMany({
          where: { shiftId, status: "ASSIGNED" },
          data: { status: "REMOVED" },
        });
        await tx.shift.update({ where: { id: shiftId }, data: { status: "CANCELLED" } });
      }

      await recordScheduleRevision(tx, {
        scheduleId: shift.scheduleId,
        actorUserId: actor.userId,
        action: hardDelete ? "SHIFT_DELETED" : "SHIFT_CANCELLED",
        summary: `${hardDelete ? "Xóa" : "Hủy"} ${label}`,
      });
      await recordAuditLog(
        {
          userId: actor.userId,
          action: hardDelete ? "SHIFT_DELETED" : "SHIFT_CANCELLED",
          entityType: "Shift",
          entityId: shiftId,
          oldValues: { name: shift.name, removedEmployees: affected },
        },
        tx,
      );
      await notifyScheduleChange(tx, {
        status: shift.schedule.status,
        weekStart: shift.schedule.weekStart,
        employeeIds: affected,
        detail: `${label} đã bị hủy, bạn không còn được phân công ca này`,
      });
      return { id: shiftId, mode: hardDelete ? "DELETED" : "CANCELLED" };
    });
    invalidateDashboardCache();
    return result;
  },
};

