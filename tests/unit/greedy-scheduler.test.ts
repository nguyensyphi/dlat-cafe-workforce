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

  it("balances shifts according to student desiredShifts preference", async () => {
    const fixture = createTestFixture();
    const tuesdayMorning = buildShiftInterval("2026-11-10", "08:00", "12:45");

    // 2nd Barista shift on Tuesday requiring 1 Barista
    fixture.shifts = [
      {
        ...fixture.shifts[0]!,
        requiredStaff: 1,
        requirements: [{ positionId: BARISTA, minCount: 1, maxCount: null }],
      },
      {
        id: "shift-morning-tue",
        templateId: "tpl-morning",
        name: "Ca Sáng Thứ 3",
        workDate: "2026-11-10",
        startAt: tuesdayMorning.startAt,
        endAt: tuesdayMorning.endAt,
        breakMinutes: 0,
        netMinutes: 285,
        requiredStaff: 1,
        maxStaff: 3,
        priority: 1,
        isPeak: false,
        requirements: [{ positionId: BARISTA, minCount: 1, maxCount: null }],
      },
    ];

    // Nam wants only 1 shift this exam week; Binh wants 2 shifts
    fixture.employees[0]!.desiredShifts = 1;
    fixture.employees[2]!.desiredShifts = 2;

    fixture.availabilities = [
      {
        employeeId: "emp-nam",
        workDate: "2026-11-09",
        templateId: "tpl-morning",
        startAt: fixture.shifts[0]!.startAt,
        endAt: fixture.shifts[0]!.endAt,
        preference: "AVAILABLE",
      },
      {
        employeeId: "emp-nam",
        workDate: "2026-11-10",
        templateId: "tpl-morning",
        startAt: tuesdayMorning.startAt,
        endAt: tuesdayMorning.endAt,
        preference: "AVAILABLE",
      },
      {
        employeeId: "emp-binh",
        workDate: "2026-11-09",
        templateId: "tpl-morning",
        startAt: fixture.shifts[0]!.startAt,
        endAt: fixture.shifts[0]!.endAt,
        preference: "AVAILABLE",
      },
      {
        employeeId: "emp-binh",
        workDate: "2026-11-10",
        templateId: "tpl-morning",
        startAt: tuesdayMorning.startAt,
        endAt: tuesdayMorning.endAt,
        preference: "AVAILABLE",
      },
    ];

    const result = await engine.solve(fixture);
    const namCount = result.proposedAssignments.filter((a) => a.employeeId === "emp-nam").length;
    const binhCount = result.proposedAssignments.filter((a) => a.employeeId === "emp-binh").length;

    expect(namCount).toBe(1);
    expect(binhCount).toBe(1);
  });

  it("supports same-day multiple shifts (Ca 1 07:00-11:00 + Ca 4 19:00-23:00) while respecting fixedRestDay", async () => {
    const fixture = createTestFixture();
    const mondayCa1 = buildShiftInterval("2026-11-09", "07:00", "11:00");
    const mondayCa4 = buildShiftInterval("2026-11-09", "19:00", "23:00");

    fixture.shifts = [
      {
        ...fixture.shifts[0]!,
        startAt: mondayCa1.startAt,
        endAt: mondayCa1.endAt,
        netMinutes: 240,
        requiredStaff: 1,
        requirements: [{ positionId: BARISTA, minCount: 1, maxCount: null }],
      },
      {
        ...fixture.shifts[1]!,
        startAt: mondayCa4.startAt,
        endAt: mondayCa4.endAt,
        netMinutes: 240,
        requiredStaff: 1,
        requirements: [{ positionId: BARISTA, minCount: 1, maxCount: null }],
      },
    ];

    // Binh has fixedRestDay on Monday (1), so only Nam can take both Ca 1 and Ca 4 on Monday
    fixture.employees = [
      fixture.employees[0]!, // Nam (Barista)
      {
        ...fixture.employees[2]!, // Binh (Barista) with fixedRestDay = 1 (Monday)
        fixedRestDay: 1,
      },
    ];

    const result = await engine.solve(fixture);
    const namShifts = result.proposedAssignments.filter((a) => a.employeeId === "emp-nam");
    const binhShifts = result.proposedAssignments.filter((a) => a.employeeId === "emp-binh");

    expect(namShifts).toHaveLength(2);
    expect(binhShifts).toHaveLength(0);
  });

  it("allows all 4 shifts (07:00-11:00, 11:00-15:00, 15:00-19:00, 19:00-23:00) and ensures at least 1 senior staff per shift (fallback to newbie if no senior available)", async () => {
    const fixture = createTestFixture();
    const s1 = buildShiftInterval("2026-11-09", "07:00", "11:00");
    const s2 = buildShiftInterval("2026-11-09", "11:00", "15:00");
    const s3 = buildShiftInterval("2026-11-09", "15:00", "19:00");
    const s4 = buildShiftInterval("2026-11-09", "19:00", "23:00");

    fixture.shifts = [
      {
        id: "shift-ca1",
        templateId: "tpl-ca1",
        name: "Ca 1 (07:00–11:00)",
        workDate: "2026-11-09",
        startAt: s1.startAt,
        endAt: s1.endAt,
        breakMinutes: 0,
        netMinutes: 240,
        requiredStaff: 1,
        maxStaff: 3,
        priority: 1,
        isPeak: false,
        requirements: [{ positionId: BARISTA, minCount: 1, maxCount: null }],
      },
      {
        id: "shift-ca2",
        templateId: "tpl-ca2",
        name: "Ca 2 (11:00–15:00)",
        workDate: "2026-11-09",
        startAt: s2.startAt,
        endAt: s2.endAt,
        breakMinutes: 0,
        netMinutes: 240,
        requiredStaff: 1,
        maxStaff: 3,
        priority: 1,
        isPeak: false,
        requirements: [{ positionId: BARISTA, minCount: 1, maxCount: null }],
      },
      {
        id: "shift-ca3",
        templateId: "tpl-ca3",
        name: "Ca 3 (15:00–19:00)",
        workDate: "2026-11-09",
        startAt: s3.startAt,
        endAt: s3.endAt,
        breakMinutes: 0,
        netMinutes: 240,
        requiredStaff: 1,
        maxStaff: 3,
        priority: 1,
        isPeak: false,
        requirements: [{ positionId: BARISTA, minCount: 1, maxCount: null }],
      },
      {
        id: "shift-ca4",
        templateId: "tpl-ca4",
        name: "Ca 4 (19:00–23:00)",
        workDate: "2026-11-09",
        startAt: s4.startAt,
        endAt: s4.endAt,
        breakMinutes: 0,
        netMinutes: 240,
        requiredStaff: 2,
        maxStaff: 3,
        priority: 2,
        isPeak: true,
        requirements: [{ positionId: BARISTA, minCount: 2, maxCount: null }],
      },
    ];

    // 1 senior (Nam, ADVANCED) and 2 newbies (Binh & Chau, BASIC / isSenior: false)
    // Suppose on Ca 4 (requires 2 staff), Nam is UNAVAILABLE -> must fallback to assigning both newbies!
    fixture.employees = [
      {
        ...fixture.employees[0]!, // Nam: Senior (ADVANCED)
        isSenior: true,
      },
      {
        ...fixture.employees[2]!, // Binh: Newbie (BASIC)
        isSenior: false,
      },
      {
        id: "emp-chau",
        fullName: "Phan Bảo Châu",
        employeeCode: "NV012",
        primaryPositionId: BARISTA,
        status: "ACTIVE",
        weeklyTargetHours: 20,
        maxWeeklyHours: 48,
        isSenior: false,
        hourlyRate: BigInt(23000),
        skills: [{ positionId: BARISTA, proficiency: "BASIC" }],
      },
    ];

    fixture.availabilities = [
      {
        employeeId: "emp-nam",
        workDate: "2026-11-09",
        templateId: "tpl-ca4",
        startAt: s4.startAt,
        endAt: s4.endAt,
        preference: "UNAVAILABLE",
      },
    ];

    const result = await engine.solve(fixture);

    // Ca 1, Ca 2, Ca 3 should pick Senior (Nam) because each shift needs at least 1 senior when available
    const ca1Assigned = result.proposedAssignments.find((a) => a.shiftId === "shift-ca1");
    const ca2Assigned = result.proposedAssignments.find((a) => a.shiftId === "shift-ca2");
    const ca3Assigned = result.proposedAssignments.find((a) => a.shiftId === "shift-ca3");
    expect(ca1Assigned?.employeeId).toBe("emp-nam");
    expect(ca2Assigned?.employeeId).toBe("emp-nam");
    expect(ca3Assigned?.employeeId).toBe("emp-nam");

    // Ca 4 has no senior available (Nam is UNAVAILABLE) -> falls back to assigning the 2 newbies (Binh & Chau)
    const ca4Assigned = result.proposedAssignments
      .filter((a) => a.shiftId === "shift-ca4")
      .map((a) => a.employeeId);
    expect(ca4Assigned).toHaveLength(2);
    expect(ca4Assigned).toEqual(expect.arrayContaining(["emp-binh", "emp-chau"]));
  });

  it("subtracts pinned assignments from slot demand and avoids duplicating pinned TRUONG_CA (max 2 staff/shift)", async () => {
    const fixture = createTestFixture();
    const s4 = buildShiftInterval("2026-11-09", "19:00", "23:00");
    const TRUONG_CA = "pos-truong-ca";

    fixture.shifts = [
      {
        id: "shift-ca4-pinned",
        templateId: "tpl-ca4",
        name: "Ca 4 (19:00–23:00)",
        workDate: "2026-11-09",
        startAt: s4.startAt,
        endAt: s4.endAt,
        breakMinutes: 0,
        netMinutes: 240,
        requiredStaff: 2,
        maxStaff: 2,
        priority: 2,
        isPeak: true,
        requirements: [{ positionId: TRUONG_CA, minCount: 1, maxCount: 1 }],
      },
    ];

    fixture.employees = [
      {
        ...fixture.employees[0]!, // Nam: pinned as TRUONG_CA
        primaryPositionId: TRUONG_CA,
        isSenior: true,
        skills: [
          { positionId: TRUONG_CA, proficiency: "ADVANCED" },
          { positionId: BARISTA, proficiency: "ADVANCED" },
        ],
      },
      {
        ...fixture.employees[1]!, // Hoa: another TRUONG_CA / CASHIER
        isSenior: true,
        skills: [
          { positionId: TRUONG_CA, proficiency: "INTERMEDIATE" },
          { positionId: CASHIER, proficiency: "INTERMEDIATE" },
        ],
      },
      {
        ...fixture.employees[2]!, // Binh: regular staff
        isSenior: false,
      },
    ];

    fixture.existingAssignments = [
      {
        shiftId: "shift-ca4-pinned",
        employeeId: "emp-nam",
        positionId: TRUONG_CA,
        isPinned: true,
      },
    ];

    const result = await engine.solve(fixture);
    const assignedForShift = result.proposedAssignments.filter(
      (a) => a.shiftId === "shift-ca4-pinned",
    );

    // Total must be exactly 2 (1 pinned + 1 auto-assigned), never 3!
    expect(assignedForShift).toHaveLength(2);
    expect(result.filledSlots).toBe(2);
    expect(result.totalSlots).toBe(2);
  });
});
