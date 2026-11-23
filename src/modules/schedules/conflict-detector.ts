/**
 * Pure, side-effect-free assignment validation.
 *
 * Used by manual assignment (Milestone 2) and reused by the automatic
 * scheduling engine (Milestone 3) so both paths apply identical rules.
 *
 * Severity:
 *  - BLOCKING: the assignment must never be saved (overlap, leave, inactive).
 *  - WARNING : saved only when the manager explicitly confirms the override.
 *  - INFO    : purely informational.
 */
import type { AvailabilityPreference, EmployeeStatus } from "@prisma/client";
import { intervalsOverlap, netShiftMinutes } from "@/lib/shift-time";

export type ConflictSeverity = "BLOCKING" | "WARNING" | "INFO";

export type ConflictCode =
  | "EMPLOYEE_INACTIVE"
  | "OVERLAP"
  | "ON_LEAVE"
  | "UNAVAILABLE"
  | "NO_AVAILABILITY"
  | "MISSING_SKILL"
  | "INSUFFICIENT_REST"
  | "WEEKLY_HOURS_EXCEEDED";

export interface AssignmentConflict {
  code: ConflictCode;
  severity: ConflictSeverity;
  message: string;
}

export type AvailabilityMatch = AvailabilityPreference | "UNKNOWN";

export interface EvaluationInterval {
  startAt: Date;
  endAt: Date;
}

export interface AssignmentEvaluationInput {
  employee: {
    id: string;
    status: EmployeeStatus;
    maxWeeklyHours: number;
    skillPositionIds: string[];
    fixedRestDay?: number | null;
  };
  shift: EvaluationInterval & {
    id: string;
    templateId: string | null;
    breakMinutes: number;
  };
  positionId: string;
  /** Other ASSIGNED shifts of the same employee near this shift (excluding this shift). */
  otherAssignments: Array<
    EvaluationInterval & {
      shiftId: string;
      shiftName: string;
      breakMinutes: number;
      inSameWeek: boolean;
    }
  >;
  /** Availability entries of the employee on the shift's work date. */
  availability: Array<
    EvaluationInterval & {
      templateId: string | null;
      preference: AvailabilityPreference;
    }
  >;
  approvedLeaves: EvaluationInterval[];
  policy: { minRestHours: number; maxWeeklyHours: number };
}

export interface AssignmentEvaluation {
  blocking: boolean;
  conflicts: AssignmentConflict[];
  preference: AvailabilityMatch;
  projectedWeeklyMinutes: number;
}

function formatHours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10} giờ`;
}

export function resolveAvailability(
  shift: AssignmentEvaluationInput["shift"],
  entries: AssignmentEvaluationInput["availability"],
): AvailabilityMatch {
  const relevant = entries.filter(
    (a) =>
      (shift.templateId !== null && a.templateId === shift.templateId) ||
      intervalsOverlap(a.startAt, a.endAt, shift.startAt, shift.endAt),
  );
  if (relevant.length === 0) {
    return "UNKNOWN";
  }
  if (relevant.some((a) => a.preference === "UNAVAILABLE")) {
    return "UNAVAILABLE";
  }
  if (relevant.some((a) => a.preference === "PREFERRED")) {
    return "PREFERRED";
  }
  return "AVAILABLE";
}

export function evaluateAssignment(
  input: AssignmentEvaluationInput,
): AssignmentEvaluation {
  const { employee, shift, policy } = input;
  const conflicts: AssignmentConflict[] = [];

  if (employee.status !== "ACTIVE") {
    conflicts.push({
      code: "EMPLOYEE_INACTIVE",
      severity: "BLOCKING",
      message: "Nhân viên đã ngừng hoạt động",
    });
  }

  for (const other of input.otherAssignments) {
    if (intervalsOverlap(other.startAt, other.endAt, shift.startAt, shift.endAt)) {
      conflicts.push({
        code: "OVERLAP",
        severity: "BLOCKING",
        message: `Trùng giờ với ${other.shiftName} đã được phân công`,
      });
    }
  }

  if (
    input.approvedLeaves.some((l) =>
      intervalsOverlap(l.startAt, l.endAt, shift.startAt, shift.endAt),
    )
  ) {
    conflicts.push({
      code: "ON_LEAVE",
      severity: "BLOCKING",
      message: "Nhân viên có đơn nghỉ phép đã được duyệt trong khung giờ này",
    });
  }

  const preference = resolveAvailability(shift, input.availability);
  if (preference === "UNAVAILABLE") {
    conflicts.push({
      code: "UNAVAILABLE",
      severity: "WARNING",
      message: "Nhân viên đã đăng ký bận trong ca này",
    });
  } else if (preference === "UNKNOWN") {
    conflicts.push({
      code: "NO_AVAILABILITY",
      severity: "INFO",
      message: "Nhân viên chưa đăng ký lịch rảnh cho ca này",
    });
  }

  if (!employee.skillPositionIds.includes(input.positionId)) {
    conflicts.push({
      code: "MISSING_SKILL",
      severity: "WARNING",
      message: "Nhân viên chưa có kỹ năng cho vị trí được phân công",
    });
  }

  if (
    employee.fixedRestDay !== undefined &&
    employee.fixedRestDay !== null &&
    preference !== "PREFERRED"
  ) {
    // Shift start in VN (+07:00) day of week (0 = Sunday .. 6 = Saturday)
    const vnShiftDay = new Date(shift.startAt.getTime() + 7 * 3600_000).getUTCDay();
    if (vnShiftDay === employee.fixedRestDay) {
      conflicts.push({
        code: "UNAVAILABLE",
        severity: "WARNING",
        message: "Trùng vào ngày nghỉ cố định hàng tuần của nhân viên",
      });
    }
  }

  const minRestMs = policy.minRestHours * 60 * 60 * 1000;
  if (minRestMs > 0) {
    const vnShiftDate = new Date(shift.startAt.getTime() + 7 * 3600_000)
      .toISOString()
      .slice(0, 10);
    for (const other of input.otherAssignments) {
      if (intervalsOverlap(other.startAt, other.endAt, shift.startAt, shift.endAt)) {
        continue;
      }
      const vnOtherDate = new Date(other.startAt.getTime() + 7 * 3600_000)
        .toISOString()
        .slice(0, 10);
      // Same-day multiple shifts (Sáng, Chiều, Tối) are allowed; minRestHours applies to overnight rest between different days
      if (vnShiftDate === vnOtherDate) {
        continue;
      }
      const gapMs =
        other.endAt.getTime() <= shift.startAt.getTime()
          ? shift.startAt.getTime() - other.endAt.getTime()
          : other.startAt.getTime() - shift.endAt.getTime();

      if (gapMs < minRestMs) {
        conflicts.push({
          code: "INSUFFICIENT_REST",
          severity: "WARNING",
          message: `Chỉ nghỉ qua đêm ${formatHours(gapMs / 60000)} giữa ${other.shiftName} và ca này (tối thiểu ${policy.minRestHours} giờ)`,
        });
      }
    }
  }

  const existingWeekMinutes = input.otherAssignments
    .filter((o) => o.inSameWeek)
    .reduce((sum, o) => sum + netShiftMinutes(o.startAt, o.endAt, o.breakMinutes), 0);
  const projectedWeeklyMinutes =
    existingWeekMinutes + netShiftMinutes(shift.startAt, shift.endAt, shift.breakMinutes);
  const limitHours = Math.min(employee.maxWeeklyHours, policy.maxWeeklyHours);
  if (projectedWeeklyMinutes > limitHours * 60) {
    conflicts.push({
      code: "WEEKLY_HOURS_EXCEEDED",
      severity: "WARNING",
      message: `Tổng giờ tuần sẽ là ${formatHours(projectedWeeklyMinutes)}, vượt giới hạn ${limitHours} giờ`,
    });
  }

  return {
    blocking: conflicts.some((c) => c.severity === "BLOCKING"),
    conflicts,
    preference,
    projectedWeeklyMinutes,
  };
}

