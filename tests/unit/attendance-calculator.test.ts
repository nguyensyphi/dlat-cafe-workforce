import { describe, expect, it } from "vitest";
import {
  calculateAttendanceTimes,
  calculateLateAndEarlyMinutes,
  minutesToDecimalHours,
  decimalHoursToMinutes,
  type EventItem,
} from "@/modules/attendance/attendance-calculator";

describe("Attendance 4-Tier Calculator & Time Utilities", () => {
  describe("Time conversion helpers", () => {
    it("converts minutes to decimal hours rounded to 2 decimal places", () => {
      expect(minutesToDecimalHours(60)).toBe(1.0);
      expect(minutesToDecimalHours(90)).toBe(1.5);
      expect(minutesToDecimalHours(270)).toBe(4.5);
      expect(minutesToDecimalHours(400)).toBe(6.67);
      expect(minutesToDecimalHours(0)).toBe(0);
    });

    it("converts decimal hours to minutes", () => {
      expect(decimalHoursToMinutes(1.5)).toBe(90);
      expect(decimalHoursToMinutes(4)).toBe(240);
      expect(decimalHoursToMinutes(6.67)).toBe(400);
    });
  });

  describe("Late and early leave calculations", () => {
    const shiftStart = new Date("2026-11-10T06:00:00.000Z");
    const shiftEnd = new Date("2026-11-10T12:00:00.000Z");

    it("detects on-time arrival within 5 minutes grace period", () => {
      const clockIn = new Date("2026-11-10T06:04:00.000Z"); // 4 mins late
      const clockOut = new Date("2026-11-10T12:01:00.000Z");
      const result = calculateLateAndEarlyMinutes({
        shiftStart,
        shiftEnd,
        clockIn,
        clockOut,
        graceMinutes: 5,
      });

      expect(result.lateMinutes).toBe(0);
      expect(result.earlyLeaveMinutes).toBe(0);
      expect(result.isOnTime).toBe(true);
    });

    it("detects late arrival when clock in exceeds grace period", () => {
      const clockIn = new Date("2026-11-10T06:18:00.000Z"); // 18 mins late
      const clockOut = new Date("2026-11-10T12:00:00.000Z");
      const result = calculateLateAndEarlyMinutes({
        shiftStart,
        shiftEnd,
        clockIn,
        clockOut,
        graceMinutes: 5,
      });

      expect(result.lateMinutes).toBe(18);
      expect(result.earlyLeaveMinutes).toBe(0);
      expect(result.isOnTime).toBe(false);
    });

    it("detects early departure when clock out is before shift end", () => {
      const clockIn = new Date("2026-11-10T05:58:00.000Z");
      const clockOut = new Date("2026-11-10T11:40:00.000Z"); // 20 mins early
      const result = calculateLateAndEarlyMinutes({
        shiftStart,
        shiftEnd,
        clockIn,
        clockOut,
        graceMinutes: 5,
      });

      expect(result.lateMinutes).toBe(0);
      expect(result.earlyLeaveMinutes).toBe(20);
      expect(result.isOnTime).toBe(false);
    });
  });

  describe("calculateAttendanceTimes (4-tier hours)", () => {
    it("calculates exact worked minutes from CLOCK_IN, BREAK_START, BREAK_END, and CLOCK_OUT", () => {
      const events: EventItem[] = [
        {
          eventType: "CLOCK_IN",
          occurredAt: new Date("2026-11-10T06:00:00.000Z"),
        },
        {
          eventType: "BREAK_START",
          occurredAt: new Date("2026-11-10T09:00:00.000Z"),
        },
        {
          eventType: "BREAK_END",
          occurredAt: new Date("2026-11-10T09:30:00.000Z"),
        },
        {
          eventType: "CLOCK_OUT",
          occurredAt: new Date("2026-11-10T12:00:00.000Z"),
        },
      ];

      const scheduledMinutes = 360; // 6h
      const result = calculateAttendanceTimes({
        events,
        scheduledMinutes,
      });

      // Total duration = 6h (360m), break = 30m, worked = 330m (5.5h)
      expect(result.workedMinutes).toBe(330);
      expect(result.breakMinutes).toBe(30);
      expect(result.isMissingClockOut).toBe(false);
      expect(result.scheduledMinutes).toBe(360);
      expect(result.approvedMinutes).toBe(330);
      expect(result.paidMinutes).toBe(330);
    });

    it("flags missing clock out when shift has ended but only CLOCK_IN exists", () => {
      const events: EventItem[] = [
        {
          eventType: "CLOCK_IN",
          occurredAt: new Date("2026-11-10T06:00:00.000Z"),
        },
      ];

      const shiftEnd = new Date("2026-11-10T12:00:00.000Z");
      const currentTime = new Date("2026-11-10T13:00:00.000Z"); // past shift end

      const result = calculateAttendanceTimes({
        events,
        scheduledMinutes: 360,
        shiftEnd,
        currentTime,
      });

      expect(result.isMissingClockOut).toBe(true);
      expect(result.clockIn).toBeDefined();
      expect(result.clockOut).toBeNull();
      // When missing clock out, approved minutes must require manager review
      expect(result.approvedMinutes).toBeNull();
      expect(result.paidMinutes).toBeNull();
    });

    it("handles multiple breaks correctly", () => {
      const events: EventItem[] = [
        {
          eventType: "CLOCK_IN",
          occurredAt: new Date("2026-11-10T06:00:00.000Z"),
        },
        {
          eventType: "BREAK_START",
          occurredAt: new Date("2026-11-10T08:00:00.000Z"),
        },
        {
          eventType: "BREAK_END",
          occurredAt: new Date("2026-11-10T08:15:00.000Z"), // 15m break
        },
        {
          eventType: "BREAK_START",
          occurredAt: new Date("2026-11-10T10:00:00.000Z"),
        },
        {
          eventType: "BREAK_END",
          occurredAt: new Date("2026-11-10T10:20:00.000Z"), // 20m break
        },
        {
          eventType: "CLOCK_OUT",
          occurredAt: new Date("2026-11-10T12:00:00.000Z"),
        },
      ];

      const result = calculateAttendanceTimes({
        events,
        scheduledMinutes: 360,
      });

      // Total time = 360m, Breaks = 15 + 20 = 35m, Worked = 325m
      expect(result.breakMinutes).toBe(35);
      expect(result.workedMinutes).toBe(325);
      expect(result.isMissingClockOut).toBe(false);
    });
  });
});

