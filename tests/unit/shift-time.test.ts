import { describe, expect, it } from "vitest";
import {
  addDaysToDateString,
  buildShiftInterval,
  intervalsOverlap,
  isMondayDateString,
  listWeekDates,
  netShiftMinutes,
} from "@/lib/shift-time";

describe("Shift time helpers (Asia/Ho_Chi_Minh)", () => {
  it("converts a local shift on a work date into UTC instants", () => {
    const { startAt, endAt } = buildShiftInterval("2026-11-09", "06:00", "12:00");
    // 06:00 ICT (UTC+7) = 23:00 UTC previous day
    expect(startAt.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(endAt.toISOString()).toBe("2026-11-09T05:00:00.000Z");
  });

  it("rolls overnight shifts to the next calendar day", () => {
    const { startAt, endAt } = buildShiftInterval("2026-11-09", "22:00", "02:00");
    expect(startAt.toISOString()).toBe("2026-11-09T15:00:00.000Z");
    expect(endAt.toISOString()).toBe("2026-11-09T19:00:00.000Z");
    expect(endAt.getTime() - startAt.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  it("rejects invalid time strings and identical start/end", () => {
    expect(() => buildShiftInterval("2026-11-09", "25:00", "12:00")).toThrow();
    expect(() => buildShiftInterval("2026-11-09", "08:00", "08:00")).toThrow();
    expect(() => buildShiftInterval("09/11/2026", "08:00", "12:00")).toThrow();
  });

  it("lists the 7 dates of a week and validates Mondays", () => {
    expect(isMondayDateString("2026-11-09")).toBe(true);
    expect(isMondayDateString("2026-11-10")).toBe(false);
    expect(listWeekDates("2026-11-09")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(addDaysToDateString("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateString("2026-11-09", -7)).toBe("2026-11-02");
  });

  it("detects half-open interval overlap and computes net minutes", () => {
    const a = buildShiftInterval("2026-11-09", "06:00", "12:00");
    const b = buildShiftInterval("2026-11-09", "12:00", "18:00");
    const c = buildShiftInterval("2026-11-09", "11:00", "15:00");
    expect(intervalsOverlap(a.startAt, a.endAt, b.startAt, b.endAt)).toBe(false);
    expect(intervalsOverlap(a.startAt, a.endAt, c.startAt, c.endAt)).toBe(true);
    expect(netShiftMinutes(a.startAt, a.endAt, 30)).toBe(330);
  });
});

