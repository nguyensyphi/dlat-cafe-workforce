import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatIsoDateOnly, formatTimeVN } from "@/lib/date";
import { addDaysToDateString, netShiftMinutes } from "@/lib/shift-time";
import type {
  EmployeeWeekSummaryDto,
  ScheduleDetailDto,
  ScheduleShiftDto,
} from "./schedule.types";

type Db = Prisma.TransactionClient | typeof prisma;

export const scheduleDetailInclude = {
  shifts: {
    orderBy: [{ startAt: "asc" }, { priority: "asc" }],
    include: {
      positionRequirements: {
        include: { position: { select: { id: true, name: true, sortOrder: true } } },
      },
      assignments: {
        where: { status: "ASSIGNED" },
        orderBy: { createdAt: "asc" },
        include: {
          employee: { select: { id: true, fullName: true, employeeCode: true } },
          position: { select: { id: true, name: true } },
        },
      },
    },
  },
  _count: { select: { revisions: true } },
} satisfies Prisma.ScheduleInclude;

export type ScheduleWithDetail = Prisma.ScheduleGetPayload<{
  include: typeof scheduleDetailInclude;
}>;

type ShiftWithDetail = ScheduleWithDetail["shifts"][number];

export function toShiftDto(shift: ShiftWithDetail): ScheduleShiftDto {
  const assignments = shift.assignments.map((a) => ({
    id: a.id,
    employeeId: a.employeeId,
    employeeName: a.employee.fullName,
    employeeCode: a.employee.employeeCode,
    positionId: a.positionId,
    positionName: a.position.name,
    isPinned: a.isPinned,
    explanation: a.explanation,
  }));

  return {
    id: shift.id,
    scheduleId: shift.scheduleId,
    templateId: shift.templateId,
    name: shift.name,
    workDate: formatIsoDateOnly(shift.workDate),
    startAt: shift.startAt.toISOString(),
    endAt: shift.endAt.toISOString(),
    startTime: formatTimeVN(shift.startAt),
    endTime: formatTimeVN(shift.endAt),
    breakMinutes: shift.breakMinutes,
    requiredStaff: shift.requiredStaff,
    maxStaff: shift.maxStaff,
    isPeak: shift.isPeak,
    status: shift.status,
    notes: shift.notes,
    netMinutes: netShiftMinutes(shift.startAt, shift.endAt, shift.breakMinutes),
    assignedCount: assignments.length,
    requirements: [...shift.positionRequirements]
      .sort((a, b) => a.position.sortOrder - b.position.sortOrder)
      .map((r) => ({
        positionId: r.positionId,
        positionName: r.position.name,
        minCount: r.minCount,
        maxCount: r.maxCount,
        assignedCount: assignments.filter((a) => a.positionId === r.positionId).length,
      })),
    assignments,
  };
}

export const scheduleRepository = {
  async findByWeekStart(weekStart: string, db: Db = prisma) {
    return db.schedule.findUnique({
      where: { weekStart: new Date(`${weekStart}T00:00:00.000Z`) },
      include: scheduleDetailInclude,
    });
  },

  async findById(id: string, db: Db = prisma) {
    return db.schedule.findUnique({
      where: { id },
      include: scheduleDetailInclude,
    });
  },

  async toDetailDto(
    schedule: ScheduleWithDetail,
    db: Db = prisma,
  ): Promise<ScheduleDetailDto> {
    const weekStart = formatIsoDateOnly(schedule.weekStart);
    const shifts = schedule.shifts.map(toShiftDto);
    const activeShifts = shifts.filter((s) => s.status !== "CANCELLED");

    const assignedEmployeeIds = new Set(
      activeShifts.flatMap((s) => s.assignments.map((a) => a.employeeId)),
    );
    const employees = await db.employee.findMany({
      where: {
        deletedAt: null,
        OR: [{ status: "ACTIVE" }, { id: { in: [...assignedEmployeeIds] } }],
      },
      orderBy: [{ primaryPosition: { sortOrder: "asc" } }, { fullName: "asc" }],
      include: { primaryPosition: { select: { id: true, name: true } } },
    });

    const employeeSummaries: EmployeeWeekSummaryDto[] = employees.map((e) => {
      const own = activeShifts.filter((s) =>
        s.assignments.some((a) => a.employeeId === e.id),
      );
      return {
        employeeId: e.id,
        fullName: e.fullName,
        employeeCode: e.employeeCode,
        primaryPositionId: e.primaryPosition.id,
        primaryPositionName: e.primaryPosition.name,
        weeklyTargetHours: Number(e.weeklyTargetHours),
        maxWeeklyHours: Number(e.maxWeeklyHours),
        assignedMinutes: own.reduce((sum, s) => sum + s.netMinutes, 0),
        shiftCount: own.length,
      };
    });

    return {
      id: schedule.id,
      weekStart,
      weekEnd: addDaysToDateString(weekStart, 6),
      name: schedule.name,
      status: schedule.status,
      publishedAt: schedule.publishedAt?.toISOString() ?? null,
      lockedAt: schedule.lockedAt?.toISOString() ?? null,
      availabilityDeadline: schedule.availabilityDeadline?.toISOString() ?? null,
      notes: schedule.notes,
      revisionCount: schedule._count.revisions,
      shifts,
      employeeSummaries,
      totals: {
        shiftCount: activeShifts.length,
        requiredSlots: activeShifts.reduce((sum, s) => sum + s.requiredStaff, 0),
        filledSlots: activeShifts.reduce(
          (sum, s) => sum + Math.min(s.assignedCount, s.requiredStaff),
          0,
        ),
        understaffedShiftCount: activeShifts.filter(
          (s) => s.assignedCount < s.requiredStaff,
        ).length,
        totalAssignedMinutes: activeShifts.reduce(
          (sum, s) => sum + s.netMinutes * s.assignedCount,
          0,
        ),
      },
    };
  },
};

