import { formatInTimeZone } from "date-fns-tz";

export const HO_CHI_MINH_TZ = "Asia/Ho_Chi_Minh";

export const DAY_OF_WEEK_LABELS_VN: Record<number, string> = {
  0: "Chủ nhật",
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
};

export function formatDateVN(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, HO_CHI_MINH_TZ, "dd/MM/yyyy");
}

export function formatTimeVN(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, HO_CHI_MINH_TZ, "HH:mm");
}

export function formatDateTimeVN(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, HO_CHI_MINH_TZ, "HH:mm dd/MM/yyyy");
}

export function formatIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date (YYYY-MM-DD) in Asia/Ho_Chi_Minh. */
export function todayDateStringVN(now: Date = new Date()): string {
  return formatInTimeZone(now, HO_CHI_MINH_TZ, "yyyy-MM-dd");
}

export function parseDateOnlyUtc(isoDateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDateStr)) {
    throw new Error(`Định dạng ngày YYYY-MM-DD không hợp lệ: ${isoDateStr}`);
  }
  const d = new Date(`${isoDateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Ngày không hợp lệ: ${isoDateStr}`);
  }
  return d;
}

export function isValidTimeHm(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const parts = value.split(":");
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

export function calculateNetShiftMinutes(
  startTime: string,
  endTime: string,
  breakMinutes = 0,
): number {
  if (!isValidTimeHm(startTime) || !isValidTimeHm(endTime)) {
    throw new Error("Giờ bắt đầu và kết thúc phải đúng định dạng HH:mm");
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
    throw new Error("Thời gian nghỉ giữa ca phải là số phút không âm");
  }

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startTotal = (sh ?? 0) * 60 + (sm ?? 0);
  const endTotal = (eh ?? 0) * 60 + (em ?? 0);

  if (startTotal === endTotal) {
    throw new Error("Giờ kết thúc không được trùng giờ bắt đầu");
  }

  const grossMinutes =
    endTotal > startTotal
      ? endTotal - startTotal
      : 24 * 60 - startTotal + endTotal;

  if (breakMinutes >= grossMinutes) {
    throw new Error("Thời gian nghỉ không được lớn hơn hoặc bằng tổng thời lượng ca");
  }

  return grossMinutes - breakMinutes;
}

export function getWeekMondayDateString(dateInput: Date | string): string {
  const isoStr =
    typeof dateInput === "string"
      ? /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
        ? dateInput
        : formatInTimeZone(new Date(dateInput), HO_CHI_MINH_TZ, "yyyy-MM-dd")
      : formatInTimeZone(dateInput, HO_CHI_MINH_TZ, "yyyy-MM-dd");

  const d = parseDateOnlyUtc(isoStr);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return formatIsoDateOnly(d);
}

