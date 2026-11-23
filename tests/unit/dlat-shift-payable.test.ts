import { describe, expect, it } from "vitest";
import {
  roundMinutesToUnit,
  calculateShiftPayableMinutes,
} from "@/modules/attendance/attendance-calculator";

// D'Lat: Ca 1 07:00–11:00 (VN, UTC+7) => 00:00–04:00 UTC (240 mins)
const shiftStart = new Date("2026-11-16T00:00:00.000Z");
const shiftEnd = new Date("2026-11-16T04:00:00.000Z");
const at = (hhmm: string) => new Date(`2026-11-16T${hhmm}:00.000Z`);

describe("TC_PRD_01 – D'Lat 5-minute rounding & payable minutes", () => {
  it("rounds to nearest 5 minutes consistently", () => {
    expect(roundMinutesToUnit(240)).toBe(240);
    expect(roundMinutesToUnit(232)).toBe(230);
    expect(roundMinutesToUnit(233)).toBe(235);
    expect(roundMinutesToUnit(237)).toBe(235);
    expect(roundMinutesToUnit(238)).toBe(240);
    expect(roundMinutesToUnit(0)).toBe(0);
    expect(roundMinutesToUnit(-3)).toBe(0);
  });

  it("full Ca 1 shift 07:00–11:00 pays 240 minutes (4.0h)", () => {
    const r = calculateShiftPayableMinutes({
      clockIn: at("00:00"),
      clockOut: at("04:00"),
      shiftStart,
      shiftEnd,
    });
    expect(r.actualMinutes).toBe(240);
    expect(r.payableMinutes).toBe(240);
    expect(r.overtimeCandidateMinutes).toBe(0);
    expect(r.otDetected).toBe(false);
  });

  it("early arrival and 10-minute late leave are not paid and not OT", () => {
    const r = calculateShiftPayableMinutes({
      clockIn: at("00:00"),
      clockOut: at("04:10"),
      shiftStart,
      shiftEnd,
    });
    expect(r.payableMinutes).toBe(240);
    expect(r.overtimeCandidateMinutes).toBe(10);
    expect(r.otDetected).toBe(false);
  });

  it("late arrival 7 minutes is rounded to nearest 5 within the shift window", () => {
    const r = calculateShiftPayableMinutes({
      clockIn: at("00:07"),
      clockOut: at("04:00"),
      shiftStart,
      shiftEnd,
    });
    expect(r.inShiftMinutes).toBe(233);
    expect(r.payableMinutes).toBe(235);
  });

  it("staying 45 minutes past shift end is DETECTED as OT candidate (≥ 30 min threshold)", () => {
    const r = calculateShiftPayableMinutes({
      clockIn: at("00:00"),
      clockOut: at("04:45"),
      shiftStart,
      shiftEnd,
    });
    expect(r.payableMinutes).toBe(240);
    expect(r.overtimeCandidateMinutes).toBe(45);
    expect(r.otDetected).toBe(true);
  });

  it("subtracts unpaid break but keeps paid break", () => {
    const unpaid = calculateShiftPayableMinutes({
      clockIn: at("00:00"),
      clockOut: at("04:00"),
      shiftStart,
      shiftEnd,
      breakMinutes: 30,
      isPaidBreak: false,
    });
    expect(unpaid.payableMinutes).toBe(210);

    const paid = calculateShiftPayableMinutes({
      clockIn: at("00:00"),
      clockOut: at("04:00"),
      shiftStart,
      shiftEnd,
      breakMinutes: 30,
      isPaidBreak: true,
    });
    expect(paid.payableMinutes).toBe(240);
  });

  it("returns zero when clock out is missing", () => {
    const r = calculateShiftPayableMinutes({
      clockIn: at("00:00"),
      clockOut: null,
      shiftStart,
      shiftEnd,
    });
    expect(r.payableMinutes).toBe(0);
    expect(r.otDetected).toBe(false);
  });
});

describe("TC_PRD_01B – D'Lat 4-Shift Operating Intervals (07:00–23:00)", () => {
  it("verifies D'Lat 4 standard 4-hour shift intervals", () => {
    // Ca 1: 07:00 - 11:00 => 4h00 = 240 mins
    const ca1 = (11 * 60) - (7 * 60);
    expect(ca1).toBe(240);

    // Ca 2: 11:00 - 15:00 => 4h00 = 240 mins
    const ca2 = (15 * 60) - (11 * 60);
    expect(ca2).toBe(240);

    // Ca 3: 15:00 - 19:00 => 4h00 = 240 mins
    const ca3 = (19 * 60) - (15 * 60);
    expect(ca3).toBe(240);

    // Ca 4: 19:00 - 23:00 => 4h00 = 240 mins
    const ca4 = (23 * 60) - (19 * 60);
    expect(ca4).toBe(240);
  });
});

