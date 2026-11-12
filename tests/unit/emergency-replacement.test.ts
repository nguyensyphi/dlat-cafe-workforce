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

describe("Standby Coverage & Emergency Replacement Engine", () => {
  const engine = new GreedySchedulerEngine();

  it("TC_STANDBY_01: auto-scheduler preserves and identifies standby reserve candidates for sudden absences", async () => {
    const mondayMorning = buildShiftInterval("2026-11-16", "06:00", "12:00");

    const shift: EngineShift = {
      id: "shift-mon-morning",
      templateId: "tpl-morning",
      name: "Ca Sáng Thứ 2",
      workDate: "2026-11-16",
      startAt: mondayMorning.startAt,
      endAt: mondayMorning.endAt,
      breakMinutes: 0,
      netMinutes: 360,
      requiredStaff: 1, // Needs 1 person
      maxStaff: 2,
      priority: 1,
      isPeak: true,
      requirements: [{ positionId: BARISTA, minCount: 1, maxCount: null }],
    };

    // 3 Baristas are available for this shift
    const employees: EngineEmployee[] = [
      {
        id: "emp-1",
        fullName: "Nguyễn Minh Khởi",
        employeeCode: "NV001",
        primaryPositionId: BARISTA,
        status: "ACTIVE",
        weeklyTargetHours: 24,
        maxWeeklyHours: 40,
        hourlyRate: 35000n,
        skills: [{ positionId: BARISTA, proficiency: "ADVANCED" }],
      },
      {
        id: "emp-2",
        fullName: "Phạm Ngọc Ánh",
        employeeCode: "NV004",
        primaryPositionId: BARISTA,
        status: "ACTIVE",
        weeklyTargetHours: 24,
        maxWeeklyHours: 40,
        hourlyRate: 32000n,
        skills: [{ positionId: BARISTA, proficiency: "ADVANCED" }],
      },
      {
        id: "emp-3",
        fullName: "Hoàng Gia Huy",
        employeeCode: "NV007",
        primaryPositionId: BARISTA,
        status: "ACTIVE",
        weeklyTargetHours: 24,
        maxWeeklyHours: 40,
        hourlyRate: 28000n,
        skills: [{ positionId: BARISTA, proficiency: "INTERMEDIATE" }],
      },
    ];

    const input: EngineInput = {
      weekStart: "2026-11-16",
      shifts: [shift],
      employees,
      availabilities: [
        {
          employeeId: "emp-1",
          workDate: "2026-11-16",
          templateId: "tpl-morning",
          startAt: mondayMorning.startAt,
          endAt: mondayMorning.endAt,
          preference: "PREFERRED",
        },
        {
          employeeId: "emp-2",
          workDate: "2026-11-16",
          templateId: "tpl-morning",
          startAt: mondayMorning.startAt,
          endAt: mondayMorning.endAt,
          preference: "AVAILABLE",
        },
        {
          employeeId: "emp-3",
          workDate: "2026-11-16",
          templateId: "tpl-morning",
          startAt: mondayMorning.startAt,
          endAt: mondayMorning.endAt,
          preference: "AVAILABLE",
        },
      ],
      leaves: [],
      policy: { minRestHours: 8, maxWeeklyHours: 48, maxConsecutiveDays: 6 },
    };

    const result = await engine.solve(input);

    expect(result.filledSlots).toBe(1);
    expect(result.proposedAssignments).toHaveLength(1);

    // Verify Standby Pools
    expect(result.standbyPools).toBeDefined();
    expect(result.standbyPools).toHaveLength(1);

    const shiftStandby = result.standbyPools![0];
    expect(shiftStandby?.shiftId).toBe("shift-mon-morning");

    // Because 1 person is assigned to work, the other 2 qualified Baristas MUST be in the standby pool!
    expect(shiftStandby?.standbyCandidates).toHaveLength(2);

    const assignedId = result.proposedAssignments[0]?.employeeId;
    const standbyIds = shiftStandby?.standbyCandidates.map((c) => c.employeeId);

    expect(standbyIds).not.toContain(assignedId);
  });

  it("TC_STANDBY_02: candidates who are marked UNAVAILABLE or on approved leave are excluded from standby", async () => {
    const mondayMorning = buildShiftInterval("2026-11-16", "06:00", "12:00");

    const shift: EngineShift = {
      id: "shift-mon-1",
      templateId: "tpl-morning",
      name: "Ca Sáng Thứ 2",
      workDate: "2026-11-16",
      startAt: mondayMorning.startAt,
      endAt: mondayMorning.endAt,
      breakMinutes: 0,
      netMinutes: 360,
      requiredStaff: 1,
      maxStaff: 2,
      priority: 1,
      isPeak: false,
      requirements: [{ positionId: CASHIER, minCount: 1, maxCount: null }],
    };

    const employees: EngineEmployee[] = [
      {
        id: "emp-working",
        fullName: "Nhân viên làm",
        employeeCode: "NV001",
        primaryPositionId: CASHIER,
        status: "ACTIVE",
        weeklyTargetHours: 24,
        maxWeeklyHours: 40,
        hourlyRate: 30000n,
        skills: [{ positionId: CASHIER, proficiency: "INTERMEDIATE" }],
      },
      {
        id: "emp-busy",
        fullName: "Nhân viên bận",
        employeeCode: "NV002",
        primaryPositionId: CASHIER,
        status: "ACTIVE",
        weeklyTargetHours: 24,
        maxWeeklyHours: 40,
        hourlyRate: 30000n,
        skills: [{ positionId: CASHIER, proficiency: "INTERMEDIATE" }],
      },
      {
        id: "emp-on-leave",
        fullName: "Nhân viên nghỉ phép",
        employeeCode: "NV003",
        primaryPositionId: CASHIER,
        status: "ACTIVE",
        weeklyTargetHours: 24,
        maxWeeklyHours: 40,
        hourlyRate: 30000n,
        skills: [{ positionId: CASHIER, proficiency: "INTERMEDIATE" }],
      },
    ];

    const input: EngineInput = {
      weekStart: "2026-11-16",
      shifts: [shift],
      employees,
      availabilities: [
        {
          employeeId: "emp-working",
          workDate: "2026-11-16",
          templateId: "tpl-morning",
          startAt: mondayMorning.startAt,
          endAt: mondayMorning.endAt,
          preference: "AVAILABLE",
        },
        {
          employeeId: "emp-busy",
          workDate: "2026-11-16",
          templateId: "tpl-morning",
          startAt: mondayMorning.startAt,
          endAt: mondayMorning.endAt,
          preference: "UNAVAILABLE", // Explicitly unavailable
        },
      ],
      leaves: [
        {
          employeeId: "emp-on-leave",
          startAt: mondayMorning.startAt,
          endAt: mondayMorning.endAt,
        },
      ],
      policy: { minRestHours: 8, maxWeeklyHours: 48, maxConsecutiveDays: 6 },
    };

    const result = await engine.solve(input);
    const shiftStandby = result.standbyPools![0];

    // Neither emp-busy nor emp-on-leave should be in the standby pool
    expect(shiftStandby?.standbyCandidates).toHaveLength(0);
  });
});

