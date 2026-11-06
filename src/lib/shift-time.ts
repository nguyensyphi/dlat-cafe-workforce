import { fromZonedTime } from "date-fns-tz";
import { HO_CHI_MINH_TZ, isValidTimeHm, parseDateOnlyUtc } from "@/lib/date";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDateString(value: string): void {
  if (!DATE_RE.test(value)) {
    throw new Error(`Ngày phải có định dạng YYYY-MM-DD: ${value}`);
  }
  parseDateOnlyUtc(value);
}

export function addDaysToDateString(date: string, days: number): string {
  assertDateString(date);
  const d = parseDateOnlyUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isMondayDateString(date: string): boolean {
  if (!DATE_RE.test(date)) {
    return false;
  }
  return parseDateOnlyUtc(date).getUTCDay() === 1;
}

export function listWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDateString(weekStart, i));
}

/**
 * Converts a local (Asia/Ho_Chi_Minh) work date + HH:mm range into UTC instants.
 * When end <= start the shift is treated as overnight and ends on the next day.
 */
export function buildShiftInterval(
  workDate: string,
  startTime: string,
  endTime: string,
): { startAt: Date; endAt: Date } {
  assertDateString(workDate);
  if (!isValidTimeHm(startTime) || !isValidTimeHm(endTime)) {
    throw new Error("Giờ bắt đầu và kết thúc phải đúng định dạng HH:mm");
  }
  if (startTime === endTime) {
    throw new Error("Giờ kết thúc không được trùng giờ bắt đầu");
  }
  const endDate = endTime > startTime ? workDate : addDaysToDateString(workDate, 1);
  return {
    startAt: fromZonedTime(`${workDate}T${startTime}:00`, HO_CHI_MINH_TZ),
    endAt: fromZonedTime(`${endDate}T${endTime}:00`, HO_CHI_MINH_TZ),
  };
}

/** Half-open interval overlap: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅ */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function netShiftMinutes(
  startAt: Date,
  endAt: Date,
  breakMinutes: number,
): number {
  const gross = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  return Math.max(0, gross - Math.max(0, breakMinutes));
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

