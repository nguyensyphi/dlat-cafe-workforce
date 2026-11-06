import { describe, expect, it } from "vitest";
import { formatVnd, parseVndToBigInt } from "@/lib/currency";
import {
  calculateNetShiftMinutes,
  formatDateVN,
  formatTimeVN,
  getWeekMondayDateString,
  isValidTimeHm,
} from "@/lib/date";

describe("VND Currency Utilities", () => {
  it("formats BigInt and number amounts in Vietnamese Dong without decimals", () => {
    expect(formatVnd(25000n)).toBe("25.000 ₫");
    expect(formatVnd(3000000n)).toBe("3.000.000 ₫");
    expect(formatVnd(0)).toBe("0 ₫");
  });

  it("formats negative VND adjustments cleanly", () => {
    expect(formatVnd(-50000n)).toBe("-50.000 ₫");
  });

  it("parses formatted or numeric VND input strings into integer BigInt", () => {
    expect(parseVndToBigInt("25.000")).toBe(25000n);
    expect(parseVndToBigInt("3,500,000 ₫")).toBe(3500000n);
    expect(parseVndToBigInt(28000)).toBe(28000n);
  });

  it("rejects non-numeric or fractional VND input", () => {
    expect(() => parseVndToBigInt("")).toThrow();
    expect(() => parseVndToBigInt("abc")).toThrow();
  });
});

describe("Asia/Ho_Chi_Minh Date & Shift Time Utilities", () => {
  it("formats UTC Date into DD/MM/YYYY and HH:mm in Asia/Ho_Chi_Minh (+07:00)", () => {
    // 2026-11-05T17:30:00Z = 2026-11-06 00:30 in Ho Chi Minh (+7)
    const utcDate = new Date("2026-11-05T17:30:00.000Z");
    expect(formatDateVN(utcDate)).toBe("06/11/2026");
    expect(formatTimeVN(utcDate)).toBe("00:30");
  });

  it("validates HH:mm time strings", () => {
    expect(isValidTimeHm("06:00")).toBe(true);
    expect(isValidTimeHm("23:59")).toBe(true);
    expect(isValidTimeHm("24:00")).toBe(false);
    expect(isValidTimeHm("6:00")).toBe(false);
  });

  it("calculates net shift duration in minutes including overnight shifts and breaks", () => {
    // Morning 06:00 - 12:00, 0 break = 360 min
    expect(calculateNetShiftMinutes("06:00", "12:00", 0)).toBe(360);
    // Full shift 06:00 - 14:30, 30 min break = 480 min
    expect(calculateNetShiftMinutes("06:00", "14:30", 30)).toBe(480);
    // Overnight closing shift 22:00 - 02:00, 15 min break = 225 min
    expect(calculateNetShiftMinutes("22:00", "02:00", 15)).toBe(225);
  });

  it("rejects zero-duration shifts or breaks exceeding shift duration", () => {
    expect(() => calculateNetShiftMinutes("12:00", "12:00", 0)).toThrow();
    expect(() => calculateNetShiftMinutes("06:00", "08:00", 120)).toThrow();
  });

  it("computes Monday week_start (YYYY-MM-DD) in Ho Chi Minh timezone", () => {
    // Sunday 2026-11-08 -> Monday 2026-11-02
    expect(getWeekMondayDateString("2026-11-08")).toBe("2026-11-02");
    // Thursday 2026-11-05 -> Monday 2026-11-02
    expect(getWeekMondayDateString("2026-11-05")).toBe("2026-11-02");
  });
});

