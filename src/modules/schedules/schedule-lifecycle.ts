import type { Prisma, ScheduleStatus } from "@prisma/client";
import { formatDateVN, formatIsoDateOnly } from "@/lib/date";
import { AppForbiddenError } from "@/lib/permissions";
import { createNotifications } from "@/modules/notifications/notification.service";

type Tx = Prisma.TransactionClient;

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã công bố",
  LOCKED: "Đã khóa",
  ARCHIVED: "Đã lưu trữ",
};

export function assertScheduleEditable(status: ScheduleStatus): void {
  if (status === "LOCKED" || status === "ARCHIVED") {
    throw new AppForbiddenError(
      `Lịch tuần đang ở trạng thái "${SCHEDULE_STATUS_LABELS[status]}" nên không thể chỉnh sửa`,
    );
  }
}

/** Serializes concurrent assignment writes for the same employee. */
export async function lockEmployeeForScheduling(tx: Tx, employeeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`employee:${employeeId}`}))`;
}

export async function refreshShiftStatus(tx: Tx, shiftId: string): Promise<void> {
  const shift = await tx.shift.findUniqueOrThrow({
    where: { id: shiftId },
    select: {
      status: true,
      requiredStaff: true,
      _count: { select: { assignments: { where: { status: "ASSIGNED" } } } },
    },
  });
  if (shift.status === "CANCELLED") {
    return;
  }
  const next = shift._count.assignments >= shift.requiredStaff ? "ASSIGNED" : "OPEN";
  if (next !== shift.status) {
    await tx.shift.update({ where: { id: shiftId }, data: { status: next } });
  }
}

/** Appends an immutable revision with a full JSON snapshot of the schedule. */
export async function recordScheduleRevision(
  tx: Tx,
  input: { scheduleId: string; actorUserId: string; action: string; summary: string },
): Promise<number> {
  const schedule = await tx.schedule.findUniqueOrThrow({
    where: { id: input.scheduleId },
    include: {
      shifts: {
        orderBy: { startAt: "asc" },
        include: {
          assignments: {
            where: { status: "ASSIGNED" },
            include: { employee: { select: { fullName: true } } },
          },
        },
      },
    },
  });

  const last = await tx.scheduleRevision.findFirst({
    where: { scheduleId: input.scheduleId },
    orderBy: { revisionNumber: "desc" },
    select: { revisionNumber: true },
  });
  const revisionNumber = (last?.revisionNumber ?? 0) + 1;

  const snapshot = {
    status: schedule.status,
    weekStart: formatIsoDateOnly(schedule.weekStart),
    shifts: schedule.shifts.map((s) => ({
      id: s.id,
      name: s.name,
      workDate: formatIsoDateOnly(s.workDate),
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      status: s.status,
      requiredStaff: s.requiredStaff,
      assignments: s.assignments.map((a) => ({
        employeeId: a.employeeId,
        employeeName: a.employee.fullName,
        positionId: a.positionId,
      })),
    })),
  };

  await tx.scheduleRevision.create({
    data: {
      scheduleId: input.scheduleId,
      revisionNumber,
      action: input.action,
      summary: input.summary,
      snapshot,
      changedById: input.actorUserId,
    },
  });
  return revisionNumber;
}

/** Notifies employees about changes to an official (published) schedule. */
export async function notifyScheduleChange(
  tx: Tx,
  input: {
    status: ScheduleStatus;
    weekStart: Date;
    employeeIds: string[];
    detail: string;
  },
): Promise<void> {
  if (input.status !== "PUBLISHED" || input.employeeIds.length === 0) {
    return;
  }
  const employees = await tx.employee.findMany({
    where: { id: { in: input.employeeIds } },
    select: { userId: true },
  });
  await createNotifications(
    tx,
    employees.map((e) => ({
      userId: e.userId,
      type: "SCHEDULE_UPDATED" as const,
      title: `Lịch tuần ${formatDateVN(input.weekStart)} đã thay đổi`,
      message: input.detail,
      linkUrl: `/employee/schedule?week=${formatIsoDateOnly(input.weekStart)}`,
    })),
  );
}

