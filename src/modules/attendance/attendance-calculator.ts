import type { AttendanceEventType } from "@prisma/client";

export interface EventItem {
  eventType: AttendanceEventType;
  occurredAt: Date;
}

export interface CalculateLateEarlyInput {
  shiftStart: Date;
  shiftEnd: Date;
  clockIn: Date;
  clockOut?: Date | null;
  graceMinutes?: number;
}

export interface LateEarlyResult {
  lateMinutes: number;
  earlyLeaveMinutes: number;
  isOnTime: boolean;
}

export function minutesToDecimalHours(minutes: number): number {
  if (minutes <= 0) return 0;
  return Number((minutes / 60).toFixed(2));
}

export function decimalHoursToMinutes(hours: number): number {
  if (hours <= 0) return 0;
  return Math.round(hours * 60);
}

export function calculateLateAndEarlyMinutes({
  shiftStart,
  shiftEnd,
  clockIn,
  clockOut,
  graceMinutes = 5,
}: CalculateLateEarlyInput): LateEarlyResult {
  const clockInMs = clockIn.getTime();
  const shiftStartMs = shiftStart.getTime();

  let lateMinutes = 0;
  if (clockInMs > shiftStartMs) {
    const diffMins = Math.floor((clockInMs - shiftStartMs) / 60_000);
    if (diffMins > graceMinutes) {
      lateMinutes = diffMins;
    }
  }

  let earlyLeaveMinutes = 0;
  if (clockOut) {
    const clockOutMs = clockOut.getTime();
    const shiftEndMs = shiftEnd.getTime();
    if (clockOutMs < shiftEndMs) {
      const diffMins = Math.floor((shiftEndMs - clockOutMs) / 60_000);
      if (diffMins > graceMinutes) {
        earlyLeaveMinutes = diffMins;
      }
    }
  }

  const isOnTime = lateMinutes === 0 && earlyLeaveMinutes === 0;

  return {
    lateMinutes,
    earlyLeaveMinutes,
    isOnTime,
  };
}

/**
 * Rounds minutes to the nearest unit (default 5). Same direction for every value,
 * per PRD 6.2: never round clock-in and clock-out in opposite directions.
 */
export function roundMinutesToUnit(minutes: number, unit = 5): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (unit <= 1) return Math.round(minutes);
  return Math.round(minutes / unit) * unit;
}

export interface ShiftPayableInput {
  clockIn: Date | null;
  clockOut: Date | null;
  shiftStart: Date;
  shiftEnd: Date;
  breakMinutes?: number;
  isPaidBreak?: boolean;
  roundingUnit?: number;
  overtimeThresholdMinutes?: number;
}

export interface ShiftPayableResult {
  /** Raw minutes between clock-in and clock-out (exact, unrounded) */
  actualMinutes: number;
  /** Minutes inside the scheduled shift window minus unpaid break (unrounded) */
  inShiftMinutes: number;
  /** Payable regular minutes after rounding, capped by scheduled duration */
  payableMinutes: number;
  /** Minutes worked after scheduled shift end (exact) */
  overtimeCandidateMinutes: number;
  /** Rounded OT minutes (only meaningful when otDetected) */
  overtimeRoundedMinutes: number;
  /** True when candidate OT reaches the configured threshold → needs manager review */
  otDetected: boolean;
}

/**
 * PRD Module D – "giờ nằm trong ca" method.
 * Handover time (last 15 minutes) lies inside the shift window, so it is paid in full.
 * Early arrival is not paid; late leave becomes an OT candidate that requires approval.
 */
export function calculateShiftPayableMinutes({
  clockIn,
  clockOut,
  shiftStart,
  shiftEnd,
  breakMinutes = 0,
  isPaidBreak = false,
  roundingUnit = 5,
  overtimeThresholdMinutes = 30,
}: ShiftPayableInput): ShiftPayableResult {
  const empty: ShiftPayableResult = {
    actualMinutes: 0,
    inShiftMinutes: 0,
    payableMinutes: 0,
    overtimeCandidateMinutes: 0,
    overtimeRoundedMinutes: 0,
    otDetected: false,
  };
  if (!clockIn || !clockOut || clockOut.getTime() <= clockIn.getTime()) {
    return empty;
  }

  const MIN = 60_000;
  const actualMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / MIN);
  const scheduledMinutes = Math.max(
    0,
    Math.floor((shiftEnd.getTime() - shiftStart.getTime()) / MIN) -
      (isPaidBreak ? 0 : breakMinutes),
  );

  const overlapStart = Math.max(clockIn.getTime(), shiftStart.getTime());
  const overlapEnd = Math.min(clockOut.getTime(), shiftEnd.getTime());
  const overlapMinutes =
    overlapEnd > overlapStart ? Math.floor((overlapEnd - overlapStart) / MIN) : 0;

  const inShiftMinutes = Math.max(0, overlapMinutes - (isPaidBreak ? 0 : breakMinutes));
  const payableMinutes = Math.min(
    scheduledMinutes,
    roundMinutesToUnit(inShiftMinutes, roundingUnit),
  );

  const overtimeCandidateMinutes =
    clockOut.getTime() > shiftEnd.getTime()
      ? Math.floor((clockOut.getTime() - shiftEnd.getTime()) / MIN)
      : 0;
  const otDetected = overtimeCandidateMinutes >= overtimeThresholdMinutes;

  return {
    actualMinutes,
    inShiftMinutes,
    payableMinutes,
    overtimeCandidateMinutes,
    overtimeRoundedMinutes: otDetected
      ? roundMinutesToUnit(overtimeCandidateMinutes, roundingUnit)
      : 0,
    otDetected,
  };
}

export interface CalculateAttendanceTimesInput {
  events: EventItem[];
  scheduledMinutes?: number;
  shiftEnd?: Date | null;
  currentTime?: Date;
  missingClockOutGraceMinutes?: number;
}

export interface AttendanceCalculationResult {
  clockIn: Date | null;
  clockOut: Date | null;
  scheduledMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  approvedMinutes: number | null;
  paidMinutes: number | null;
  isMissingClockOut: boolean;
}

export function calculateAttendanceTimes({
  events,
  scheduledMinutes = 0,
  shiftEnd,
  currentTime = new Date(),
}: CalculateAttendanceTimesInput): AttendanceCalculationResult {
  if (events.length === 0) {
    return {
      clockIn: null,
      clockOut: null,
      scheduledMinutes,
      workedMinutes: 0,
      breakMinutes: 0,
      approvedMinutes: null,
      paidMinutes: null,
      isMissingClockOut: false,
    };
  }

  // Sort events chronologically
  const sorted = [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const clockInEvent = sorted.find((e) => e.eventType === "CLOCK_IN");
  const clockOutEvent = [...sorted].reverse().find((e) => e.eventType === "CLOCK_OUT");

  const clockIn = clockInEvent ? clockInEvent.occurredAt : null;
  const clockOut = clockOutEvent ? clockOutEvent.occurredAt : null;

  // Determine if missing clock out
  let isMissingClockOut = false;
  if (clockIn && !clockOut) {
    // If ca kết thúc hoặc đã qua hơn 1 giờ kể từ khi hết ca hoặc hơn 14 tiếng kể từ clockIn
    const nowMs = currentTime.getTime();
    const clockInMs = clockIn.getTime();
    const shiftEndMs = shiftEnd ? shiftEnd.getTime() : null;

    if (shiftEndMs && nowMs > shiftEndMs) {
      isMissingClockOut = true;
    } else if (nowMs - clockInMs > 14 * 60 * 60_000) {
      // Worked > 14 hours without clock out
      isMissingClockOut = true;
    }
  }

  // Calculate break durations
  let totalBreakMinutes = 0;
  let activeBreakStart: Date | null = null;

  for (const e of sorted) {
    if (e.eventType === "BREAK_START") {
      activeBreakStart = e.occurredAt;
    } else if (e.eventType === "BREAK_END" && activeBreakStart) {
      const diffMs = e.occurredAt.getTime() - activeBreakStart.getTime();
      if (diffMs > 0) {
        totalBreakMinutes += Math.floor(diffMs / 60_000);
      }
      activeBreakStart = null;
    }
  }

  // If clock out occurred while on break, add partial break
  if (activeBreakStart && clockOut && clockOut.getTime() > activeBreakStart.getTime()) {
    const diffMs = clockOut.getTime() - activeBreakStart.getTime();
    totalBreakMinutes += Math.floor(diffMs / 60_000);
  }

  // Calculate worked minutes: Total Span (ClockIn -> ClockOut) - Break Minutes
  let totalWorkedMinutes = 0;
  if (clockIn && clockOut && clockOut.getTime() > clockIn.getTime()) {
    const totalSpanMinutes = Math.floor(
      (clockOut.getTime() - clockIn.getTime()) / 60_000,
    );
    totalWorkedMinutes = Math.max(0, totalSpanMinutes - totalBreakMinutes);
  }

  // 4-Tier Hours resolution:
  // If missing clock out, approved/paid hours CANNOT be automatically inferred without manager review
  const approvedMinutes = isMissingClockOut ? null : totalWorkedMinutes;
  const paidMinutes = isMissingClockOut ? null : totalWorkedMinutes;

  return {
    clockIn,
    clockOut,
    scheduledMinutes,
    workedMinutes: totalWorkedMinutes,
    breakMinutes: totalBreakMinutes,
    approvedMinutes,
    paidMinutes,
    isMissingClockOut,
  };
}

