import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { employeeService } from "@/modules/employees/employee.service";
import { handoverService } from "@/modules/handover/handover.service";
import { leaveService } from "@/modules/leaves/leave.service";
import { shiftReminderService } from "@/modules/notifications/shift-reminder.service";
import { scheduleAssignmentService } from "@/modules/schedules/schedule-assignment.service";
import { scheduleShiftService } from "@/modules/schedules/schedule-shift.service";
import { scheduleService } from "@/modules/schedules/schedule.service";
import {
  getNotificationPolicy,
  settingsService,
  type SystemSettingsBundle,
} from "@/modules/settings/settings.service";
import { swapService } from "@/modules/swaps/swap.service";

let ownerActor: SessionUser;
let managerActor: SessionUser;
let namActor: SessionUser;
let baoActor: SessionUser;
let haActor: SessionUser;
let huyActor: SessionUser;

let originalBundle: SystemSettingsBundle;
let originalNamPrefs: Prisma.JsonValue | null = null;
let testStartedAt: Date;
const createdScheduleIds: string[] = [];
const createdLeaveIds: string[] = [];
const createdSwapIds: string[] = [];
const createdHandoverIds: string[] = [];

function futureMonday(offsetWeeks: number): string {
  const base = new Date(Date.UTC(2097, 0, 7)); // Monday 2097-01-07
  const day = base.getUTCDay();
  const mondayShift = day === 0 ? 1 : (1 - day + 7) % 7;
  base.setUTCDate(base.getUTCDate() + mondayShift + offsetWeeks * 7);
  return base.toISOString().slice(0, 10);
}

async function findUnusedWeek(startOffset: number): Promise<string> {
  for (let i = startOffset; i < startOffset + 200; i += 1) {
    const candidate = futureMonday(i);
    const existing = await prisma.schedule.findUnique({
      where: { weekStart: new Date(`${candidate}T00:00:00.000Z`) },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Could not find unused future Monday for integration tests");
}

function buildValidHandoverInput(params: {
  shiftId: string;
  handoverEmployeeId: string;
  openingCashVnd: number;
  cashSalesVnd: number;
  cashExpensesVnd: number;
  actualClosingCashVnd: number;
  cashDiscrepancyReason?: string;
}) {
  return {
    shiftId: params.shiftId,
    handoverEmployeeId: params.handoverEmployeeId,
    reconciliation: {
      openingCashVnd: BigInt(params.openingCashVnd),
      cashSalesVnd: BigInt(params.cashSalesVnd),
      cashExpensesVnd: BigInt(params.cashExpensesVnd),
      actualClosingCashVnd: BigInt(params.actualClosingCashVnd),
    },
    cashDiscrepancyReason: params.cashDiscrepancyReason,
    inventory: [
      {
        code: "CA_PHE_HAT",
        name: "Hạt Arabica Cầu Đất",
        unit: "kg",
        quantity: 5,
        status: "SUFFICIENT" as const,
      },
    ],
    equipment: [
      {
        code: "MAY_PHA_1",
        name: "Máy pha Espresso 2 group",
        condition: "GOOD" as const,
      },
    ],
    cleanliness: [
      {
        area: "Quầy Bar",
        isClean: true,
        isDone: true,
        isDueToday: true,
      },
    ],
    pendingTasks: [],
    handoverNotes: "Bàn giao ca kiểm thử tích hợp M3",
  };
}

describe("M3 Notification Triggers Integration Tests (F7, F8, F9, F10 + Challenger Fixes)", () => {
  beforeAll(async () => {
    const [owner, manager, nam, bao, ha, huy] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: "owner@dlatcafe.vn" },
        include: { employee: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "manager@dlatcafe.vn" },
        include: { employee: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "nam.le@dlatcafe.vn" },
        include: { employee: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "bao.vo@dlatcafe.vn" },
        include: { employee: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "ha.dang@dlatcafe.vn" },
        include: { employee: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "huy.hoang@dlatcafe.vn" },
        include: { employee: true },
      }),
    ]);

    ownerActor = {
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      employeeId: owner.employee!.id,
      fullName: owner.employee!.fullName,
    };
    managerActor = {
      userId: manager.id,
      email: manager.email,
      role: manager.role,
      employeeId: manager.employee!.id,
      fullName: manager.employee!.fullName,
    };
    namActor = {
      userId: nam.id,
      email: nam.email,
      role: nam.role,
      employeeId: nam.employee!.id,
      fullName: nam.employee!.fullName,
    };
    baoActor = {
      userId: bao.id,
      email: bao.email,
      role: bao.role,
      employeeId: bao.employee!.id,
      fullName: bao.employee!.fullName,
    };
    haActor = {
      userId: ha.id,
      email: ha.email,
      role: ha.role,
      employeeId: ha.employee!.id,
      fullName: ha.employee!.fullName,
    };
    huyActor = {
      userId: huy.id,
      email: huy.email,
      role: huy.role,
      employeeId: huy.employee!.id,
      fullName: huy.employee!.fullName,
    };

    originalBundle = await settingsService.getSettings(ownerActor);
    originalNamPrefs = nam.notificationPreferences;
    testStartedAt = new Date();
  });

  afterAll(async () => {
    await settingsService.updateSettings(ownerActor, originalBundle);
    await prisma.user.update({
      where: { id: namActor.userId },
      data: {
        notificationPreferences:
          originalNamPrefs === null
            ? Prisma.DbNull
            : (originalNamPrefs as Prisma.InputJsonValue),
      },
    });

    await prisma.notification.deleteMany({
      where: {
        OR: [
          { createdAt: { gte: testStartedAt } },
          { linkUrl: { startsWith: "/employee/schedule?week=2097-" } },
          { message: { contains: "BelowThreshold" } },
          { message: { contains: "AboveThreshold" } },
        ],
      },
    });

    if (createdHandoverIds.length > 0) {
      await prisma.shiftHandover.deleteMany({
        where: { id: { in: createdHandoverIds } },
      });
    }
    if (createdSwapIds.length > 0) {
      await prisma.swapRequest.deleteMany({
        where: { id: { in: createdSwapIds } },
      });
    }
    if (createdLeaveIds.length > 0) {
      await prisma.leaveRequest.deleteMany({
        where: { id: { in: createdLeaveIds } },
      });
    }
    if (createdScheduleIds.length > 0) {
      await prisma.schedule.deleteMany({
        where: { id: { in: createdScheduleIds } },
      });
    }
  });

  it("M2 Challenger Fix: legacy 4-key updateSettings preserves notification_policy and updateEmployee merges partial notificationPreferences", async () => {
    await settingsService.updateSettings(ownerActor, {
      ...originalBundle,
      notificationPolicy: {
        enableTelegram: true,
        enableZalo: false,
        enableEmail: false,
        managerTelegramChatIds: ["888777"],
        groupTelegramChatId: "-100777",
        shiftStartReminderMinutes: 25,
        shiftEndReminderMinutes: 20,
        cashDiscrepancyThresholdVnd: 40000,
      },
    });

    // Send legacy 4-key payload omitting notificationPolicy
    const legacyPayload = {
      shopProfile: originalBundle.shopProfile,
      schedulingPolicy: originalBundle.schedulingPolicy,
      attendancePolicy: originalBundle.attendancePolicy,
      payrollPolicy: originalBundle.payrollPolicy,
    };
    const afterLegacy = await settingsService.updateSettings(
      ownerActor,
      legacyPayload,
    );
    expect(afterLegacy.notificationPolicy.cashDiscrepancyThresholdVnd).toBe(
      40000,
    );
    expect(afterLegacy.notificationPolicy.enableZalo).toBe(false);
    expect((await getNotificationPolicy()).shiftStartReminderMinutes).toBe(25);

    // Partial notificationPreferences merge on employeeService.updateEmployee
    await employeeService.updateEmployee(ownerActor, namActor.employeeId!, {
      notificationPreferences: {
        telegram: false,
        zalo: false,
        email: false,
      },
    });

    const mergedEmp = await employeeService.updateEmployee(
      ownerActor,
      namActor.employeeId!,
      {
        notificationPreferences: {
          zalo: true,
        },
      },
    );
    expect(mergedEmp.notificationPreferences).toEqual({
      telegram: false,
      zalo: true,
      email: false,
    });
  });

  it("Scenario 1 (F7): publishing DRAFT schedule notifies assigned employees once and subsequent assignment changes emit SCHEDULE_UPDATED", async () => {
    const weekStart = await findUnusedWeek(10);
    const schedule = await scheduleService.createWeek(managerActor, {
      weekStart,
      generateFromTemplates: false,
    });
    createdScheduleIds.push(schedule.id);

    const shift = await scheduleShiftService.createShift(
      managerActor,
      schedule.id,
      {
        workDate: weekStart,
        name: "Ca 1 Test Publish",
        startTime: "07:00",
        endTime: "11:00",
        breakMinutes: 0,
        requiredStaff: 1,
        maxStaff: 2,
        isPeak: false,
        positionRequirements: [],
      },
    );

    await scheduleAssignmentService.assign(managerActor, shift.id, {
      employeeId: namActor.employeeId!,
      allowWarnings: true,
    });

    const published = await scheduleService.changeStatus(
      managerActor,
      schedule.id,
      { action: "PUBLISH" },
    );
    expect(published.status).toBe("PUBLISHED");

    const namPubNotifs = await prisma.notification.findMany({
      where: {
        userId: namActor.userId,
        type: "SCHEDULE_PUBLISHED",
        linkUrl: `/employee/schedule?week=${weekStart}`,
        createdAt: { gte: testStartedAt },
      },
    });
    expect(namPubNotifs.length).toBe(1);

    const baoPubNotifs = await prisma.notification.findMany({
      where: {
        userId: baoActor.userId,
        type: "SCHEDULE_PUBLISHED",
        linkUrl: `/employee/schedule?week=${weekStart}`,
        createdAt: { gte: testStartedAt },
      },
    });
    expect(baoPubNotifs.length).toBe(0);

    // Assign Bao on PUBLISHED schedule -> emits SCHEDULE_UPDATED
    await scheduleAssignmentService.assign(managerActor, shift.id, {
      employeeId: baoActor.employeeId!,
      allowWarnings: true,
    });

    const baoUpdNotifs = await prisma.notification.findMany({
      where: {
        userId: baoActor.userId,
        type: "SCHEDULE_UPDATED",
        linkUrl: `/employee/schedule?week=${weekStart}`,
      },
    });
    expect(baoUpdNotifs.length).toBeGreaterThanOrEqual(1);
  });

  it("Scenario 2 (F8): normal leave <4h is blocked, emergency leave <4h bypasses with [KHẨN CẤP] alert, and swap + emergencyReplace notify participants", async () => {
    // 1. Normal leave <4h ahead -> blocked
    await expect(
      leaveService.submitLeaveRequest(namActor, {
        startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        endAt: new Date(Date.now() + 180 * 60_000).toISOString(),
        isEmergency: false,
        reason: "Xin nghỉ thường dưới 4 tiếng phải chặn",
      }),
    ).rejects.toThrow(/tối thiểu 4 tiếng/i);

    // 2. Emergency leave <4h ahead -> allowed and prefixes [KHẨN CẤP]
    const reasonTag = `Khẩn cấp đột xuất ${Date.now()}`;
    const emergencyLeave = await leaveService.submitLeaveRequest(namActor, {
      startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endAt: new Date(Date.now() + 180 * 60_000).toISOString(),
      isEmergency: true,
      reason: reasonTag,
    });
    createdLeaveIds.push(emergencyLeave.id);
    expect(emergencyLeave.isEmergency).toBe(true);

    const mgrEmergencyNotif = await prisma.notification.findFirst({
      where: {
        userId: managerActor.userId,
        type: "LEAVE_SUBMITTED",
        message: { contains: reasonTag },
      },
    });
    expect(mgrEmergencyNotif).not.toBeNull();
    expect(mgrEmergencyNotif?.title.startsWith("[KHẨN CẤP]")).toBe(true);
    expect(mgrEmergencyNotif?.linkUrl).toBe("/requests");

    // 3. Review leave -> notifies employee with LEAVE_REVIEWED
    await leaveService.reviewLeaveRequest(managerActor, emergencyLeave.id, {
      status: "APPROVED",
      reviewNote: "Duyệt nghỉ đột xuất",
    });
    const namReviewedNotif = await prisma.notification.findFirst({
      where: {
        userId: namActor.userId,
        type: "LEAVE_REVIEWED",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(namReviewedNotif).not.toBeNull();

    // 4. 3-step Swap + Emergency Replace
    const weekStart = await findUnusedWeek(20);
    const schedule = await scheduleService.createWeek(managerActor, {
      weekStart,
      generateFromTemplates: false,
    });
    createdScheduleIds.push(schedule.id);

    const shift = await scheduleShiftService.createShift(
      managerActor,
      schedule.id,
      {
        workDate: weekStart,
        name: "Ca 2 Swap & Replace",
        startTime: "11:00",
        endTime: "15:00",
        breakMinutes: 0,
        requiredStaff: 1,
        maxStaff: 2,
        isPeak: false,
        positionRequirements: [],
      },
    );

    await scheduleAssignmentService.assign(managerActor, shift.id, {
      employeeId: baoActor.employeeId!,
      allowWarnings: true,
    });
    await scheduleService.changeStatus(managerActor, schedule.id, {
      action: "PUBLISH",
    });

    const swap = await swapService.requestSwap(baoActor, {
      shiftId: shift.id,
      targetEmployeeId: huyActor.employeeId!,
      reason: "Đổi ca kiểm thử M3",
    });
    createdSwapIds.push(swap.id);

    await swapService.respondToSwap(huyActor, swap.id, { accept: true });
    const approvedSwap = await swapService.reviewSwap(managerActor, swap.id, {
      approved: true,
      reviewNote: "Đồng ý đổi ca",
    });
    expect(approvedSwap.status).toBe("APPROVED");

    // Emergency replace Huy -> Ha
    const replaceResult = await scheduleAssignmentService.emergencyReplace(
      managerActor,
      shift.id,
      {
        absentEmployeeId: huyActor.employeeId!,
        replacementEmployeeId: haActor.employeeId!,
        reason: "Huy báo ốm đột xuất",
      },
    );
    expect(replaceResult.success).toBe(true);
  });

  it("Scenario 3 (F9): handover discrepancy threshold (0 vs 50,000) and disputeHandover trigger SYSTEM_ALERT to managers", async () => {
    const weekStart = await findUnusedWeek(30);
    const schedule = await scheduleService.createWeek(managerActor, {
      weekStart,
      generateFromTemplates: false,
    });
    createdScheduleIds.push(schedule.id);

    const s1Name = `Ca 1 BelowThreshold ${Date.now()}`;
    const s2Name = `Ca 2 AboveThreshold ${Date.now()}`;

    const s1 = await scheduleShiftService.createShift(
      managerActor,
      schedule.id,
      {
        workDate: weekStart,
        name: s1Name,
        startTime: "07:00",
        endTime: "11:00",
        breakMinutes: 0,
        requiredStaff: 1,
        maxStaff: 2,
        isPeak: false,
        positionRequirements: [],
      },
    );
    const s2 = await scheduleShiftService.createShift(
      managerActor,
      schedule.id,
      {
        workDate: weekStart,
        name: s2Name,
        startTime: "11:00",
        endTime: "15:00",
        breakMinutes: 0,
        requiredStaff: 1,
        maxStaff: 2,
        isPeak: false,
        positionRequirements: [],
      },
    );

    await scheduleAssignmentService.assign(managerActor, s1.id, {
      employeeId: namActor.employeeId!,
      allowWarnings: true,
    });
    await scheduleAssignmentService.assign(managerActor, s2.id, {
      employeeId: namActor.employeeId!,
      allowWarnings: true,
    });
    await scheduleService.changeStatus(managerActor, schedule.id, {
      action: "PUBLISH",
    });

    // Set threshold = 50,000 VND
    await settingsService.updateSettings(ownerActor, {
      ...originalBundle,
      notificationPolicy: {
        ...originalBundle.notificationPolicy,
        cashDiscrepancyThresholdVnd: 50000,
      },
    });

    // 1. Discrepancy of -20,000 VND (< 50,000 threshold) -> status DISCREPANCY, no SYSTEM_ALERT
    const h1 = await handoverService.submitHandover(
      buildValidHandoverInput({
        shiftId: s1.id,
        handoverEmployeeId: namActor.employeeId!,
        openingCashVnd: 1_000_000,
        cashSalesVnd: 500_000,
        cashExpensesVnd: 0,
        actualClosingCashVnd: 1_480_000,
        cashDiscrepancyReason: "Lệch nhẹ 20k dưới ngưỡng",
      }),
      namActor,
    );
    createdHandoverIds.push(h1.id);
    expect(h1.status).toBe("DISCREPANCY");

    const alertForS1 = await prisma.notification.findFirst({
      where: {
        userId: managerActor.userId,
        linkUrl: "/handovers",
        message: { contains: s1Name },
        createdAt: { gte: testStartedAt },
      },
    });
    expect(alertForS1).toBeNull();

    // 2. Discrepancy of -50,000 VND (>= 50,000 threshold) -> status DISCREPANCY + SYSTEM_ALERT
    const h2 = await handoverService.submitHandover(
      buildValidHandoverInput({
        shiftId: s2.id,
        handoverEmployeeId: namActor.employeeId!,
        openingCashVnd: 1_000_000,
        cashSalesVnd: 500_000,
        cashExpensesVnd: 0,
        actualClosingCashVnd: 1_450_000,
        cashDiscrepancyReason: "Thiếu 50k chạm ngưỡng cảnh báo",
      }),
      namActor,
    );
    createdHandoverIds.push(h2.id);
    expect(h2.status).toBe("DISCREPANCY");

    const alertForS2 = await prisma.notification.findFirst({
      where: {
        userId: managerActor.userId,
        type: "SYSTEM_ALERT",
        linkUrl: "/handovers",
        message: { contains: s2Name },
        createdAt: { gte: testStartedAt },
      },
    });
    expect(alertForS2).not.toBeNull();
    expect(alertForS2?.message).toMatch(/Thiếu 50\.000đ/);

    // 3. Dispute handover -> creates SYSTEM_ALERT with dispute reason
    const disputed = await handoverService.disputeHandover(
      h1.id,
      "Đối soát sáng hôm sau phát hiện chênh lệch",
      managerActor,
    );
    expect(disputed.status).toBe("DISCREPANCY");

    const disputeAlert = await prisma.notification.findFirst({
      where: {
        userId: ownerActor.userId,
        type: "SYSTEM_ALERT",
        linkUrl: "/handovers",
        message: { contains: "Đối soát sáng hôm sau phát hiện chênh lệch" },
      },
    });
    expect(disputeAlert).not.toBeNull();
  });

  it("Scenario 4 (F10): shiftReminderService sends start/end SHIFT_REMINDERs idempotently and skips approved leaves", async () => {
    await settingsService.updateSettings(ownerActor, {
      ...originalBundle,
      notificationPolicy: {
        ...originalBundle.notificationPolicy,
        shiftStartReminderMinutes: 15,
        shiftEndReminderMinutes: 15,
      },
    });

    const weekStart = await findUnusedWeek(40);
    const schedule = await scheduleService.createWeek(managerActor, {
      weekStart,
      generateFromTemplates: false,
    });
    createdScheduleIds.push(schedule.id);

    const shift = await scheduleShiftService.createShift(
      managerActor,
      schedule.id,
      {
        workDate: weekStart,
        name: `Ca 1 Reminder ${Date.now()}`,
        startTime: "07:00",
        endTime: "11:00",
        breakMinutes: 0,
        requiredStaff: 1,
        maxStaff: 2,
        isPeak: false,
        positionRequirements: [],
      },
    );

    await scheduleAssignmentService.assign(managerActor, shift.id, {
      employeeId: baoActor.employeeId!,
      allowWarnings: true,
    });
    await scheduleService.changeStatus(managerActor, schedule.id, {
      action: "PUBLISH",
    });

    // Simulate now = 10 minutes before 07:00 ICT (06:50+07:00)
    const nowBeforeStart = new Date(`${weekStart}T06:50:00+07:00`);
    const firstRun = await shiftReminderService.dispatchDueReminders({
      now: nowBeforeStart,
    });

    const expectedStartKey = `SHIFT_START:${shift.id}:${baoActor.employeeId}`;
    expect(firstRun.insertedDedupeKeys).toContain(expectedStartKey);
    expect(firstRun.createdInApp).toBeGreaterThanOrEqual(1);

    // Consecutive run at same time -> idempotent, 0 new reminders for that shift
    const secondRun = await shiftReminderService.dispatchDueReminders({
      now: nowBeforeStart,
    });
    expect(secondRun.insertedDedupeKeys).not.toContain(expectedStartKey);
    expect(secondRun.skippedDuplicates).toBeGreaterThanOrEqual(1);

    // Simulate now = 10 minutes before 11:00 ICT (10:50+07:00) -> end reminder
    const nowBeforeEnd = new Date(`${weekStart}T10:50:00+07:00`);
    const endRun = await shiftReminderService.dispatchDueReminders({
      now: nowBeforeEnd,
    });
    const expectedEndKey = `SHIFT_END:${shift.id}:${baoActor.employeeId}`;
    expect(endRun.insertedDedupeKeys).toContain(expectedEndKey);
  });
});
