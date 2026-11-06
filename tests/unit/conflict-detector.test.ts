import { describe, expect, it } from "vitest";
import { buildShiftInterval } from "@/lib/shift-time";
import {
  evaluateAssignment,
  type AssignmentEvaluationInput,
} from "@/modules/schedules/conflict-detector";

const BARISTA = "pos-barista";
const CASHIER = "pos-cashier";

function baseInput(
  overrides: Partial<AssignmentEvaluationInput> = {},
): AssignmentEvaluationInput {
  const morning = buildShiftInterval("2026-11-09", "06:00", "12:00");
  return {
    employee: {
      id: "emp-1",
      status: "ACTIVE",
      maxWeeklyHours: 48,
      skillPositionIds: [BARISTA],
    },
    shift: {
      id: "shift-morning",
      templateId: "tpl-morning",
      startAt: morning.startAt,
      endAt: morning.endAt,
      breakMinutes: 0,
    },
    positionId: BARISTA,
    otherAssignments: [],
    availability: [
      {
        templateId: "tpl-morning",
        startAt: morning.startAt,
        endAt: morning.endAt,
        preference: "AVAILABLE",
      },
    ],
    approvedLeaves: [],
    policy: { minRestHours: 8, maxWeeklyHours: 48 },
    ...overrides,
  };
}

describe("Assignment conflict detector", () => {
  it("returns no conflicts for a valid, available, skilled employee", () => {
    const result = evaluateAssignment(baseInput());
    expect(result.blocking).toBe(false);
    expect(result.conflicts).toEqual([]);
    expect(result.preference).toBe("AVAILABLE");
    expect(result.projectedWeeklyMinutes).toBe(360);
  });

  it("blocks overlapping shifts for the same employee", () => {
    const overlap = buildShiftInterval("2026-11-09", "10:00", "14:00");
    const result = evaluateAssignment(
      baseInput({
        otherAssignments: [
          {
            shiftId: "shift-x",
            shiftName: "Ca chen",
            startAt: overlap.startAt,
            endAt: overlap.endAt,
            breakMinutes: 0,
            inSameWeek: true,
          },
        ],
      }),
    );
    expect(result.blocking).toBe(true);
    expect(result.conflicts.map((c) => c.code)).toContain("OVERLAP");
  });

  it("blocks inactive employees and approved leave", () => {
    const inactive = evaluateAssignment(
      baseInput({
        employee: {
          id: "emp-1",
          status: "INACTIVE",
          maxWeeklyHours: 48,
          skillPositionIds: [BARISTA],
        },
      }),
    );
    expect(inactive.blocking).toBe(true);
    expect(inactive.conflicts.map((c) => c.code)).toContain("EMPLOYEE_INACTIVE");

    const day = buildShiftInterval("2026-11-09", "00:00", "23:59");
    const onLeave = evaluateAssignment(
      baseInput({ approvedLeaves: [{ startAt: day.startAt, endAt: day.endAt }] }),
    );
    expect(onLeave.blocking).toBe(true);
    expect(onLeave.conflicts.map((c) => c.code)).toContain("ON_LEAVE");
  });

  it("warns (not blocks) on unavailable, missing skill, short rest and weekly limit", () => {
    const morning = buildShiftInterval("2026-11-09", "06:00", "12:00");
    const lateNight = buildShiftInterval("2026-11-08", "18:00", "23:00");
    const result = evaluateAssignment(
      baseInput({
        positionId: CASHIER,
        availability: [
          {
            templateId: "tpl-morning",
            startAt: morning.startAt,
            endAt: morning.endAt,
            preference: "UNAVAILABLE",
          },
        ],
        otherAssignments: [
          {
            shiftId: "shift-prev",
            shiftName: "Ca Tối",
            startAt: lateNight.startAt,
            endAt: lateNight.endAt,
            breakMinutes: 0,
            inSameWeek: true,
          },
        ],
        employee: {
          id: "emp-1",
          status: "ACTIVE",
          maxWeeklyHours: 8,
          skillPositionIds: [BARISTA],
        },
      }),
    );
    const codes = result.conflicts.map((c) => c.code);
    expect(result.blocking).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        "UNAVAILABLE",
        "MISSING_SKILL",
        "INSUFFICIENT_REST",
        "WEEKLY_HOURS_EXCEEDED",
      ]),
    );
    expect(result.conflicts.every((c) => c.severity === "WARNING")).toBe(true);
    expect(result.preference).toBe("UNAVAILABLE");
    // 5h previous shift + 6h this shift
    expect(result.projectedWeeklyMinutes).toBe(660);
  });

  it("reports missing availability submission as informational only", () => {
    const result = evaluateAssignment(baseInput({ availability: [] }));
    expect(result.preference).toBe("UNKNOWN");
    expect(result.blocking).toBe(false);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ code: "NO_AVAILABILITY", severity: "INFO" }),
    ]);
  });

  it("does not count assignments outside the week toward weekly hours", () => {
    const prevWeek = buildShiftInterval("2026-11-08", "06:00", "12:00");
    const result = evaluateAssignment(
      baseInput({
        otherAssignments: [
          {
            shiftId: "shift-prev-week",
            shiftName: "Ca Sáng CN",
            startAt: prevWeek.startAt,
            endAt: prevWeek.endAt,
            breakMinutes: 0,
            inSameWeek: false,
          },
        ],
      }),
    );
    expect(result.projectedWeeklyMinutes).toBe(360);
  });
});

