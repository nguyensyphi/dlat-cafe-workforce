import { describe, expect, it } from "vitest";
import {
  assignEmployeeSchema,
  createScheduleSchema,
  createShiftSchema,
  moveAssignmentSchema,
  scheduleStatusActionSchema,
  weekStartSchema,
} from "@/modules/schedules/schedule.validation";
import { submitAvailabilitySchema } from "@/modules/availability/availability.validation";

describe("Schedule and Availability Validation Schemas", () => {
  it("validates that weekStart must be a Monday in YYYY-MM-DD format", () => {
    // 2026-11-09 is a Monday
    expect(weekStartSchema.safeParse("2026-11-09").success).toBe(true);

    // 2026-11-10 is a Tuesday -> must fail
    const tue = weekStartSchema.safeParse("2026-11-10");
    expect(tue.success).toBe(false);
    if (!tue.success) {
      expect(tue.error.issues[0]?.message).toMatch(/Thứ Hai/);
    }

    // Invalid format
    expect(weekStartSchema.safeParse("09/11/2026").success).toBe(false);
    expect(weekStartSchema.safeParse("invalid-date").success).toBe(false);
  });

  it("validates createScheduleSchema options", () => {
    const valid = createScheduleSchema.safeParse({
      weekStart: "2026-11-09",
      generateFromTemplates: true,
      name: "Lịch Tuần Mẫu",
    });
    expect(valid.success).toBe(true);

    const invalid = createScheduleSchema.safeParse({
      weekStart: "2026-11-11", // Wednesday
    });
    expect(invalid.success).toBe(false);
  });

  it("validates scheduleStatusActionSchema allowed actions", () => {
    expect(scheduleStatusActionSchema.safeParse({ action: "PUBLISH" }).success).toBe(true);
    expect(scheduleStatusActionSchema.safeParse({ action: "LOCK" }).success).toBe(true);
    expect(scheduleStatusActionSchema.safeParse({ action: "UNLOCK" }).success).toBe(true);
    expect(scheduleStatusActionSchema.safeParse({ action: "ARCHIVE" }).success).toBe(true);
    expect(scheduleStatusActionSchema.safeParse({ action: "DELETE" }).success).toBe(false);
  });

  it("validates createShiftSchema required staff and max staff rules", () => {
    const valid = createShiftSchema.safeParse({
      workDate: "2026-11-09",
      name: "Ca Sáng",
      startTime: "06:00",
      endTime: "12:00",
      breakMinutes: 0,
      requiredStaff: 3,
      maxStaff: 5,
    });
    expect(valid.success).toBe(true);

    const invalidStaff = createShiftSchema.safeParse({
      workDate: "2026-11-09",
      name: "Ca Lỗi",
      startTime: "06:00",
      endTime: "12:00",
      breakMinutes: 0,
      requiredStaff: 4,
      maxStaff: 2, // maxStaff < requiredStaff
    });
    expect(invalidStaff.success).toBe(false);
  });

  it("validates assignEmployeeSchema and moveAssignmentSchema", () => {
    const validAssign = assignEmployeeSchema.safeParse({
      employeeId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      allowWarnings: true,
    });
    expect(validAssign.success).toBe(true);

    const invalidUuid = assignEmployeeSchema.safeParse({
      employeeId: "not-a-uuid",
    });
    expect(invalidUuid.success).toBe(false);

    const validMove = moveAssignmentSchema.safeParse({
      targetShiftId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      allowWarnings: false,
    });
    expect(validMove.success).toBe(true);
  });

  it("validates submitAvailabilitySchema slots and weekStart", () => {
    const valid = submitAvailabilitySchema.safeParse({
      weekStart: "2026-11-09",
      slots: [
        {
          workDate: "2026-11-09",
          templateId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          preference: "PREFERRED",
          note: "Thích làm ca sáng",
        },
        {
          workDate: "2026-11-10",
          templateId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          preference: "UNAVAILABLE",
          note: "Đi học",
        },
      ],
    });
    expect(valid.success).toBe(true);

    const invalidPref = submitAvailabilitySchema.safeParse({
      weekStart: "2026-11-09",
      slots: [
        {
          workDate: "2026-11-09",
          templateId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          preference: "MAYBE", // invalid enum
        },
      ],
    });
    expect(invalidPref.success).toBe(false);
  });
});

