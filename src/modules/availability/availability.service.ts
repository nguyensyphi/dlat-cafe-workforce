import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { formatDateVN, formatIsoDateOnly, parseDateOnlyUtc } from "@/lib/date";
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
} from "@/lib/shift-time";
import { parseOrThrow } from "@/lib/validation";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { loadSettingsBundle } from "@/modules/settings/settings.service";
import { computeAvailabilityDeadline } from "@/modules/schedules/schedule.service";
import type {
  EmployeeWeekAvailabilityDto,
  WeekAvailabilityOverviewDto,
} from "./availability.types";
import {
  submitAvailabilitySchema,
  type SubmitAvailabilityInput,
} from "./availability.validation";

export const availabilityService = {
  /**
   * Retrieves availability slots for the logged-in employee for the given week.
   * Auto-populates all active shift templates for each of the 7 days.
   */
  async getMyAvailability(
    actor: SessionUser,
    weekStart: string,
    targetEmployeeId?: string,
  ): Promise<EmployeeWeekAvailabilityDto> {
    assertPermission(actor.role, "self:availability");

    const empId =
      actor.role === "EMPLOYEE"
        ? actor.employeeId
        : targetEmployeeId ?? actor.employeeId;

    if (!empId) {
      throw new AppNotFoundError("Không tìm thấy thông tin nhân viên");
    }

    const employee = await prisma.employee.findUnique({
      where: { id: empId },
      select: { id: true, fullName: true, employeeCode: true, status: true },
    });
    if (!employee || employee.status === "INACTIVE") {
      throw new AppValidationError("Nhân viên không tồn tại hoặc đã ngừng hoạt động");
    }

    const weekDates = listWeekDates(weekStart);
    const weekEnd = addDaysToDateString(weekStart, 6);

    const [settings, schedule, templates, existingSlots] = await Promise.all([
      loadSettingsBundle(),
      prisma.schedule.findUnique({
        where: { weekStart: new Date(`${weekStart}T00:00:00.000Z`) },
        select: { id: true, status: true, availabilityDeadline: true },
      }),
      prisma.shiftTemplate.findMany({
        where: { isActive: true },
        orderBy: [{ startTime: "asc" }, { priority: "asc" }],
      }),
      prisma.availability.findMany({
        where: {
          employeeId: empId,
          weekStart: new Date(`${weekStart}T00:00:00.000Z`),
        },
      }),
    ]);

    const leadDays = Number(settings.schedulingPolicy.availabilityLeadDays);
    const deadlineAt =
      schedule?.availabilityDeadline ??
      computeAvailabilityDeadline(weekStart, leadDays);
    const deadlinePassed = new Date() > deadlineAt;

    const slotMap = new Map<string, (typeof existingSlots)[number]>();
    for (const slot of existingSlots) {
      if (slot.templateId) {
        const key = `${formatIsoDateOnly(slot.workDate)}_${slot.templateId}`;
        slotMap.set(key, slot);
      }
    }

    const days = weekDates.map((dateStr) => {
      const d = parseDateOnlyUtc(dateStr);
      const dayOfWeek = d.getUTCDay();

      const slots = templates.map((tpl) => {
        const key = `${dateStr}_${tpl.id}`;
        const found = slotMap.get(key);
        return {
          templateId: tpl.id,
          templateCode: tpl.code,
          templateName: tpl.name,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          workDate: dateStr,
          preference: found?.preference ?? "AVAILABLE",
          note: found?.note ?? null,
        };
      });

      return {
        workDate: dateStr,
        dayOfWeek,
        slots,
      };
    });

    const isSubmitted = existingSlots.length > 0;

    return {
      employeeId: employee.id,
      employeeName: employee.fullName,
      employeeCode: employee.employeeCode,
      weekStart,
      weekEnd,
      submissionStatus: isSubmitted ? "SUBMITTED" : "DRAFT",
      deadlinePassed,
      deadlineAt: deadlineAt.toISOString(),
      days,
    };
  },

  /**
   * Submits or updates availability preferences for the given week.
   */
  async submitAvailability(
    actor: SessionUser,
    rawInput: SubmitAvailabilityInput,
    overrideEmployeeId?: string,
  ): Promise<EmployeeWeekAvailabilityDto> {
    assertPermission(actor.role, "self:availability");

    const data = parseOrThrow(submitAvailabilitySchema, rawInput);
    const empId =
      actor.role === "EMPLOYEE"
        ? actor.employeeId
        : overrideEmployeeId ?? actor.employeeId;

    if (!empId) {
      throw new AppNotFoundError("Không tìm thấy thông tin nhân viên");
    }

    const [settings, schedule, templates] = await Promise.all([
      loadSettingsBundle(),
      prisma.schedule.findUnique({
        where: { weekStart: new Date(`${data.weekStart}T00:00:00.000Z`) },
        select: { id: true, status: true, availabilityDeadline: true },
      }),
      prisma.shiftTemplate.findMany({
        where: { isActive: true },
      }),
    ]);

    const leadDays = Number(settings.schedulingPolicy.availabilityLeadDays);
    const deadlineAt =
      schedule?.availabilityDeadline ??
      computeAvailabilityDeadline(data.weekStart, leadDays);

    // Non-managers are blocked if deadline passed and schedule is locked/published
    if (actor.role === "EMPLOYEE" && new Date() > deadlineAt) {
      if (schedule && (schedule.status === "PUBLISHED" || schedule.status === "LOCKED")) {
        throw new AppForbiddenError(
          `Hạn đăng ký lịch rảnh (${formatDateVN(deadlineAt)}) đã kết thúc`,
        );
      }
    }

    const templateMap = new Map(templates.map((t) => [t.id, t]));

    await prisma.$transaction(async (tx) => {
      for (const slot of data.slots) {
        const tpl = templateMap.get(slot.templateId);
        if (!tpl) continue;

        const { startAt, endAt } = buildShiftInterval(
          slot.workDate,
          tpl.startTime,
          tpl.endTime,
        );

        await tx.availability.upsert({
          where: {
            employeeId_workDate_templateId: {
              employeeId: empId,
              workDate: new Date(`${slot.workDate}T00:00:00.000Z`),
              templateId: slot.templateId,
            },
          },
          update: {
            preference: slot.preference,
            startAt,
            endAt,
            submissionStatus: "SUBMITTED",
            note: slot.note ?? null,
          },
          create: {
            employeeId: empId,
            weekStart: new Date(`${data.weekStart}T00:00:00.000Z`),
            workDate: new Date(`${slot.workDate}T00:00:00.000Z`),
            templateId: slot.templateId,
            startAt,
            endAt,
            preference: slot.preference,
            submissionStatus: "SUBMITTED",
            note: slot.note ?? null,
          },
        });
      }

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "AVAILABILITY_SUBMITTED",
          entityType: "Availability",
          entityId: `${empId}:${data.weekStart}`,
          newValues: {
            employeeId: empId,
            weekStart: data.weekStart,
            slotCount: data.slots.length,
          },
        },
        tx,
      );
    });

    return this.getMyAvailability(actor, data.weekStart, empId);
  },

  /**
   * Manager overview of all employees' availability for a given week.
   */
  async getWeekOverview(
    actor: SessionUser,
    weekStart: string,
  ): Promise<WeekAvailabilityOverviewDto> {
    assertPermission(actor.role, "schedules:read");

    const weekEnd = addDaysToDateString(weekStart, 6);

    const [settings, schedule, employees, availabilities] = await Promise.all([
      loadSettingsBundle(),
      prisma.schedule.findUnique({
        where: { weekStart: new Date(`${weekStart}T00:00:00.000Z`) },
        select: { id: true, availabilityDeadline: true },
      }),
      prisma.employee.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        orderBy: [{ primaryPosition: { sortOrder: "asc" } }, { fullName: "asc" }],
        include: { primaryPosition: { select: { name: true } } },
      }),
      prisma.availability.findMany({
        where: { weekStart: new Date(`${weekStart}T00:00:00.000Z`) },
      }),
    ]);

    const leadDays = Number(settings.schedulingPolicy.availabilityLeadDays);
    const deadlineAt =
      schedule?.availabilityDeadline ??
      computeAvailabilityDeadline(weekStart, leadDays);
    const deadlinePassed = new Date() > deadlineAt;

    const empSlotMap = new Map<string, typeof availabilities>();
    for (const av of availabilities) {
      const list = empSlotMap.get(av.employeeId) ?? [];
      list.push(av);
      empSlotMap.set(av.employeeId, list);
    }

    const employeeRows = employees.map((emp) => {
      const slots = empSlotMap.get(emp.id) ?? [];
      const hasSubmission = slots.length > 0;

      const preferredCount = slots.filter((s) => s.preference === "PREFERRED").length;
      const availableCount = slots.filter((s) => s.preference === "AVAILABLE").length;
      const unavailableCount = slots.filter((s) => s.preference === "UNAVAILABLE").length;

      const latestSlot = slots.reduce<Date | null>((max, curr) => {
        return !max || curr.updatedAt > max ? curr.updatedAt : max;
      }, null);

      return {
        employeeId: emp.id,
        fullName: emp.fullName,
        employeeCode: emp.employeeCode,
        primaryPositionName: emp.primaryPosition.name,
        submissionStatus: hasSubmission ? ("SUBMITTED" as const) : ("DRAFT" as const),
        preferredCount,
        availableCount,
        unavailableCount,
        updatedAt: latestSlot ? latestSlot.toISOString() : null,
      };
    });

    const submittedCount = employeeRows.filter(
      (r) => r.submissionStatus === "SUBMITTED",
    ).length;

    // Build availability heatmap per shift template and work date
    const heatmapMap = new Map<
      string,
      { availableCount: number; preferredCount: number; employeeNames: string[] }
    >();
    const empNameMap = new Map(employees.map((e) => [e.id, e.fullName]));

    for (const av of availabilities) {
      if (!av.templateId) continue;
      if (av.preference === "UNAVAILABLE") continue;

      const dateStr = formatIsoDateOnly(av.workDate);
      const key = `${dateStr}_${av.templateId}`;
      const entry = heatmapMap.get(key) || {
        availableCount: 0,
        preferredCount: 0,
        employeeNames: [],
      };
      if (av.preference === "PREFERRED") {
        entry.preferredCount += 1;
      } else {
        entry.availableCount += 1;
      }
      const name = empNameMap.get(av.employeeId);
      if (name) entry.employeeNames.push(name);
      heatmapMap.set(key, entry);
    }

    const heatmap = Array.from(heatmapMap.entries()).map(([key, data]) => {
      const [workDate, templateId] = key.split("_");
      return {
        workDate: workDate!,
        templateId: templateId!,
        availableCount: data.availableCount,
        preferredCount: data.preferredCount,
        totalAvailable: data.availableCount + data.preferredCount,
        employeeNames: data.employeeNames,
      };
    });

    return {
      weekStart,
      weekEnd,
      deadlineAt: deadlineAt.toISOString(),
      deadlinePassed,
      totalEmployees: employees.length,
      submittedEmployees: submittedCount,
      employees: employeeRows,
      heatmap,
    };
  },
};
