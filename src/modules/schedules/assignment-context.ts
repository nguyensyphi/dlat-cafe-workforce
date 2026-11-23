import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatIsoDateOnly } from "@/lib/date";
import { addDaysToDateString } from "@/lib/shift-time";
import { loadSettingsBundle } from "@/modules/settings/settings.service";
import type { AssignmentEvaluationInput } from "./conflict-detector";

type Db = Prisma.TransactionClient | typeof prisma;

export interface ContextShift {
  id: string;
  name: string;
  templateId: string | null;
  workDate: Date;
  startAt: Date;
  endAt: Date;
  breakMinutes: number;
}

export interface EmployeeContext {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  primaryPositionId: string;
  primaryPositionName: string;
  skillPositionIds: string[];
  /** Evaluation input without positionId — caller decides the position. */
  base: Omit<AssignmentEvaluationInput, "positionId">;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Loads everything required to evaluate assigning employees to `shift`.
 * `excludeShiftIds` lets a move operation ignore the source shift.
 */
export async function loadAssignmentContexts(
  db: Db,
  input: {
    shift: ContextShift;
    weekStart: string;
    employeeIds?: string[];
    excludeShiftIds?: string[];
  },
): Promise<Map<string, EmployeeContext>> {
  const { shift, weekStart } = input;
  const weekEnd = addDaysToDateString(weekStart, 6);
  const excluded = new Set([shift.id, ...(input.excludeShiftIds ?? [])]);

  const [settings, employees] = await Promise.all([
    loadSettingsBundle(),
    db.employee.findMany({
      where: input.employeeIds
        ? { id: { in: input.employeeIds } }
        : { status: "ACTIVE", deletedAt: null },
      include: {
        primaryPosition: { select: { id: true, name: true } },
        skills: { select: { positionId: true } },
      },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const ids = employees.map((e) => e.id);
  const workDate = formatIsoDateOnly(shift.workDate);

  const [assignments, availability, leaves] = await Promise.all([
    db.shiftAssignment.findMany({
      where: {
        employeeId: { in: ids },
        status: "ASSIGNED",
        shift: {
          status: { not: "CANCELLED" },
          workDate: {
            gte: dateOnly(addDaysToDateString(weekStart, -1)),
            lte: dateOnly(addDaysToDateString(weekEnd, 1)),
          },
        },
      },
      include: {
        shift: {
          select: {
            id: true,
            name: true,
            workDate: true,
            startAt: true,
            endAt: true,
            breakMinutes: true,
          },
        },
      },
    }),
    db.availability.findMany({
      where: { employeeId: { in: ids }, workDate: dateOnly(workDate) },
    }),
    db.leaveRequest.findMany({
      where: {
        employeeId: { in: ids },
        status: "APPROVED",
        startAt: { lt: shift.endAt },
        endAt: { gt: shift.startAt },
      },
      select: { employeeId: true, startAt: true, endAt: true },
    }),
  ]);

  const policy = {
    minRestHours: Number(settings.schedulingPolicy.minRestHours),
    maxWeeklyHours: Number(settings.schedulingPolicy.maxWeeklyHours),
  };

  const result = new Map<string, EmployeeContext>();
  for (const e of employees) {
    const skillPositionIds = Array.from(
      new Set([e.primaryPositionId, ...e.skills.map((s) => s.positionId)]),
    );
    result.set(e.id, {
      employeeId: e.id,
      fullName: e.fullName,
      employeeCode: e.employeeCode,
      primaryPositionId: e.primaryPositionId,
      primaryPositionName: e.primaryPosition.name,
      skillPositionIds,
      base: {
        employee: {
          id: e.id,
          status: e.status,
          maxWeeklyHours: Number(e.maxWeeklyHours),
          skillPositionIds,
          fixedRestDay: e.fixedRestDay,
        },
        shift: {
          id: shift.id,
          templateId: shift.templateId,
          startAt: shift.startAt,
          endAt: shift.endAt,
          breakMinutes: shift.breakMinutes,
        },
        otherAssignments: assignments
          .filter((a) => a.employeeId === e.id && !excluded.has(a.shiftId))
          .map((a) => {
            const d = formatIsoDateOnly(a.shift.workDate);
            return {
              shiftId: a.shift.id,
              shiftName: `${a.shift.name} (${d.slice(8, 10)}/${d.slice(5, 7)})`,
              startAt: a.shift.startAt,
              endAt: a.shift.endAt,
              breakMinutes: a.shift.breakMinutes,
              inSameWeek: d >= weekStart && d <= weekEnd,
            };
          }),
        availability: availability
          .filter((a) => a.employeeId === e.id)
          .map((a) => ({
            templateId: a.templateId,
            startAt: a.startAt,
            endAt: a.endAt,
            preference: a.preference,
          })),
        approvedLeaves: leaves
          .filter((l) => l.employeeId === e.id)
          .map((l) => ({ startAt: l.startAt, endAt: l.endAt })),
        policy,
      },
    });
  }
  return result;
}

/**
 * Picks the position an employee should fill on a shift: the first
 * under-staffed requirement they are skilled for, else their primary position.
 */
export function suggestPositionId(
  ctx: Pick<EmployeeContext, "skillPositionIds" | "primaryPositionId">,
  requirements: Array<{ positionId: string; minCount: number; assignedCount: number }>,
): string {
  const open = requirements.find(
    (r) => r.assignedCount < r.minCount && ctx.skillPositionIds.includes(r.positionId),
  );
  if (open) {
    return open.positionId;
  }
  const skilled = requirements.find((r) => ctx.skillPositionIds.includes(r.positionId));
  if (skilled && !ctx.skillPositionIds.includes(ctx.primaryPositionId)) {
    return skilled.positionId;
  }
  return ctx.primaryPositionId;
}

