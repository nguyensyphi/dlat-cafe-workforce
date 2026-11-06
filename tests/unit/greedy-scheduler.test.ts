import { describe, expect, it } from "vitest";
import { buildShiftInterval } from "@/lib/shift-time";
import { GreedySchedulerEngine } from "@/modules/auto-scheduling/greedy-scheduler";
import type {
  EngineEmployee,
  EngineInput,
  EngineShift,
} from "@/modules/auto-scheduling/scheduling-engine.types";

const BARISTA = "pos-barista";
const CASHIER = "pos-cashier";

describe("Deterministic Greedy Automatic Scheduling Engine", () => {
  const engine = new GreedySchedulerEngine();

  function createTestFixture(): EngineInput {
    const mondayMorning = buildShiftInterval("2026-11-09", "06:00", "12:00");
    const mondayEvening = buildShiftInterval("2026-11-09", "18:00", "23:00");

    const shifts: EngineShift[] = [
      {
        id: "shift-morning-1",
        templateId: "tpl-morning",
        name: "Ca Sáng Thứ 2",
        workDate: "2026-11-09",
        startAt: mondayMorning.startAt,
        endAt: mondayMorning.endAt,
        breakMinutes: 0,
        netMinutes: 360,
        requiredStaff: 2,
        maxStaff: 3,
        priority: 1,
        isPeak: true,
        requirements: [{ positionId: BARISTA, minCount: 2, maxCount: null }],
      },
      {
        id: "shift-evening-1",
        templateId: "tpl-evening",
        name: "Ca Tối Thứ 2",
        workDate: "2026-11-09",
        startAt: mondayEvening.startAt,
        endAt: mondayEvening.endAt,
        breakMinutes: 0,
        netMinutes: 300,
        requiredStaff: 1,
        maxStaff: 2,
        priority: 1,
        isPeak: false,
        requirements: [{ positionId: CASHIER, minCount: 1, maxCount: null }],
      },
    ];

    const employees: EngineEmployee[] = [
      {
        id: "emp-nam",
        fullName: "Lê Hoàng Nam",
        employeeCode: "NV001",
        primaryPositionId: BARISTA,
        status: "ACTIVE",
        weeklyTargetHours: 24,
        maxWeeklyHours: 48,
        hourlyRate: BigInt(35000),
        skills: [{ positionId: BARISTA, proficiency: "ADVANCED" }],
      },
      {
        id: "emp-hoa",
        fullName: "Trần Thị Hoa",
        employeeCode: "NV002",
        primaryPositionId: CASHIER,
        status: "ACTIVE",
        weeklyTargetHours: 24,
        maxWeeklyHours: 48,
        hourlyRate: BigInt(30000),
        skills: [{ positionId: CASHIER, proficiency: "INTERMEDIATE" }],
      },
      {
        id: "emp-binh",
        fullName: "Nguyễn Văn Bình",
        employeeCode: "NV003",
        primaryPositionId: BARISTA,
        status: "ACTIVE",
        weeklyTargetHours: 20,
        maxWeeklyHours: 48,
        hourlyRate: BigInt(32000),
        skills: [{ positionId: BARISTA, proficiency: "BASIC" }],
      },
    ];

    return {
      weekStart: "2026-11-09",
      shifts,
      employees,
      availabilities: [],
      leaves: [],
      policy: {
        minRestHours: 8,
        maxWeeklyHours: 48,
        maxConsecutiveDays: 6,
      },
    };
  }

  it("successfully proposes assignments meeting hard constraints", async () => {
    const fixture = createTestFixture();
    const result = await engine.solve(fixture);

    expect(result.filledSlots).toBe(3); // 2 on morning + 1 on evening
    expect(result.unfilledShifts).toHaveLength(0);

    // Verify Nam (Barista Advanced) is assigned to the peak morning shift
    const morningAssignments = result.proposedAssignments.filter(
      (p) => p.shiftId === "shift-morning-1",
    );
    expect(morningAssignments).toHaveLength(2);
    expect(morningAssignments.map((a) => a.employeeId)).toContain("emp-nam");

    // Verify Hoa (Cashier) is assigned to the evening cashier shift
    const eveningAssignments = result.proposedAssignments.filter(
      (p) => p.shiftId === "shift-evening-1",
    );
    expect(eveningAssignments).toHaveLength(1);
    expect(eveningAssignments[0]?.employeeId).toBe("emp-hoa");

    // Check cost estimation calculation
    expect(BigInt(result.estimatedTotalLaborCostVND)).toBeGreaterThan(BigInt(0));
  });

  it("strictly respects approved leave and does not assign employee on leave", async () => {
    const fixture = createTestFixture();
    const morning = buildShiftInterval("2026-11-09", "06:00", "12:00");

    // Add approved leave for Nam during the morning shift
    fixture.leaves.push({
      employeeId: "emp-nam",
      startAt: morning.startAt,
      endAt: morning.endAt,
    });

    const result = await engine.solve(fixture);
    const morningAssignments = result.proposedAssignments.filter(
      (p) => p.shiftId === "shift-morning-1",
    );

    // Nam must NOT be assigned to morning shift
    expect(morningAssignments.map((a) => a.employeeId)).not.toContain("emp-nam");
  });

  it("strictly respects UNAVAILABLE preference from availability registration", async () => {
    const fixture = createTestFixture();

    // Hoa reports UNAVAILABLE for evening shift
    fixture.availabilities.push({
      employeeId: "emp-hoa",
      workDate: "2026-11-09",
      templateId: "tpl-evening",
      startAt: fixture.shifts[1]!.startAt,
      endAt: fixture.shifts[1]!.endAt,
      preference: "UNAVAILABLE",
    });

    const result = await engine.solve(fixture);
    const eveningAssignments = result.proposedAssignments.filter(
      (p) => p.shiftId === "shift-evening-1",
    );

    // Hoa must not be assigned to evening
    expect(eveningAssignments.map((a) => a.employeeId)).not.toContain("emp-hoa");
    // Evening shift becomes unfilled because neither Nam nor Binh have Cashier skill
    expect(result.unfilledShifts.some((u) => u.shiftId === "shift-evening-1")).toBe(
      true,
    );
  });

  it("prioritizes employee with PREFERRED registration", async () => {
    const fixture = createTestFixture();

    // Binh marks PREFERRED for morning shift
    fixture.availabilities.push({
      employeeId: "emp-binh",
      workDate: "2026-11-09",
      templateId: "tpl-morning",
      startAt: fixture.shifts[0]!.startAt,
      endAt: fixture.shifts[0]!.endAt,
      preference: "PREFERRED",
    });

    const result = await engine.solve(fixture);
    const binhAssignment = result.proposedAssignments.find(
      (a) => a.employeeId === "emp-binh" && a.shiftId === "shift-morning-1",
    );

    expect(binhAssignment).toBeDefined();
    expect(binhAssignment?.explanation).toContain("Ưu tiên theo nguyện vọng");
  });
});
