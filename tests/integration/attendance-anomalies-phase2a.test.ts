import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { attendanceMonitorService } from "@/modules/attendance/attendance-monitor.service";
import { attendanceService } from "@/modules/attendance/attendance.service";

describe("Pha 2A Integration Tests — Missing Clock-Out (+60m), One-Tap Fix & Late/No-Show (+15m)", () => {
  let ownerActor: SessionUser;
  let employeeActor: SessionUser;
  let scheduleId: string;
  let shiftId: string;
  let attendanceId: string;
  let lateEmployeeId: string;
  let leaveEmployeeId: string;
  let missingEmployeeId: string;
  let leaveRequestId: string;

  // Use a unique far-future week so we never collide with seeded schedules
  const workDateIso = "2031-06-16"; // Monday
  const workDateUtc = new Date(`${workDateIso}T00:00:00.000Z`);
  // Ca 1: 07:00 - 11:00 VN (+07:00)
  const shiftStartAt = new Date(`${workDateIso}T07:00:00.000+07:00`);
  const shiftEndAt = new Date(`${workDateIso}T11:00:00.000+07:00`);

  beforeAll(async () => {
    const ownerUser = await prisma.user.findFirstOrThrow({
      where: { role: "OWNER", isActive: true },
      include: { employee: true },
    });
    ownerActor = {
      userId: ownerUser.id,
      email: ownerUser.email,
      role: "OWNER",
      employeeId: ownerUser.employee?.id ?? null,
      fullName: ownerUser.employee?.fullName ?? ownerUser.email,
    };

    const activeEmployees = await prisma.employee.findMany({
      where: { status: "ACTIVE", deletedAt: null, user: { isActive: true } },
      include: { user: true },
      take: 3,
      orderBy: { employeeCode: "asc" },
    });
    expect(activeEmployees.length).toBeGreaterThanOrEqual(3);

    missingEmployeeId = activeEmployees[0]!.id;
    lateEmployeeId = activeEmployees[1]!.id;
    leaveEmployeeId = activeEmployees[2]!.id;

    employeeActor = {
      userId: activeEmployees[0]!.userId,
      email: activeEmployees[0]!.email,
      role: "EMPLOYEE",
      employeeId: missingEmployeeId,
      fullName: activeEmployees[0]!.fullName,
    };

    const pos = await prisma.position.findFirstOrThrow({
      where: { isActive: true },
    });

    // Cleanup any leftover from aborted previous run
    await prisma.schedule.deleteMany({ where: { weekStart: workDateUtc } });

    const schedule = await prisma.schedule.create({
      data: {
        weekStart: workDateUtc,
        name: "Test Schedule Pha 2A",
        status: "PUBLISHED",
      },
    });
    scheduleId = schedule.id;

    const shift = await prisma.shift.create({
      data: {
        scheduleId: schedule.id,
        name: "Ca 1 Test Pha 2A (07:00–11:00)",
        workDate: workDateUtc,
        startAt: shiftStartAt,
        endAt: shiftEndAt,
        breakMinutes: 0,
        isPaidBreak: true,
        requiredStaff: 2,
        status: "ASSIGNED",
      },
    });
    shiftId = shift.id;

    await prisma.shiftAssignment.createMany({
      data: [
        { shiftId: shift.id, employeeId: missingEmployeeId, positionId: pos.id, status: "ASSIGNED" },
        { shiftId: shift.id, employeeId: lateEmployeeId, positionId: pos.id, status: "ASSIGNED" },
        { shiftId: shift.id, employeeId: leaveEmployeeId, positionId: pos.id, status: "ASSIGNED" },
      ],
    });

    // Employee 0 clocked in on time at 07:02, forgot to clock out
    const att = await prisma.attendance.create({
      data: {
        employeeId: missingEmployeeId,
        shiftId: shift.id,
        workDate: workDateUtc,
        clockIn: new Date(`${workDateIso}T07:02:00.000+07:00`),
        clockOut: null,
        scheduledMinutes: 240,
        workedMinutes: 0,
        isMissingClockOut: false,
        completionStatus: "IN_PROGRESS",
        anomalyStatus: "CLEAN",
        status: "PENDING",
      },
    });
    attendanceId = att.id;

    // Employee 2 has an APPROVED leave covering the shift -> must NOT trigger late/no-show alert
    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: leaveEmployeeId,
        shiftId: shift.id,
        startAt: shiftStartAt,
        endAt: shiftEndAt,
        reason: "Nghỉ phép có duyệt test Pha 2A",
        status: "APPROVED",
        reviewedById: ownerActor.userId,
        reviewedAt: new Date(),
      },
    });
    leaveRequestId = leave.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: {
        OR: [
          { dedupeKey: { startsWith: `MISSING_CLOCK_OUT:EMP:${attendanceId}` } },
          { dedupeKey: { startsWith: `MISSING_CLOCK_OUT:MGR:${attendanceId}:` } },
          { dedupeKey: { startsWith: `LATE_NO_SHOW:MGR:${shiftId}:` } },
        ],
      },
    });
    await prisma.auditLog.deleteMany({
      where: { entityId: attendanceId },
    });
    if (leaveRequestId) {
      await prisma.leaveRequest.deleteMany({ where: { id: leaveRequestId } });
    }
    if (attendanceId) {
      await prisma.attendanceEvent.deleteMany({ where: { attendanceId } });
      await prisma.attendance.deleteMany({ where: { id: attendanceId } });
    }
    if (scheduleId) {
      await prisma.schedule.deleteMany({ where: { id: scheduleId } });
    }
  });

  it("detects late/no-show after +15m idempotently and skips employees with approved leave", async () => {
    // At +10m (07:10 VN) -> too early, should detect 0
    const tooEarly = await attendanceMonitorService.scanLateOrNoShow({
      now: new Date(`${workDateIso}T07:10:00.000+07:00`),
    });
    expect(
      tooEarly.insertedDedupeKeys.filter((k) => k.includes(shiftId)),
    ).toHaveLength(0);

    // At +20m (07:20 VN) -> detects lateEmployeeId ONLY (skips missingEmployeeId who clocked in & leaveEmployeeId who has approved leave)
    const firstRun = await attendanceMonitorService.scanLateOrNoShow({
      now: new Date(`${workDateIso}T07:20:00.000+07:00`),
    });
    const shiftKeys = firstRun.insertedDedupeKeys.filter((k) =>
      k.startsWith(`LATE_NO_SHOW:MGR:${shiftId}:`),
    );
    expect(shiftKeys.length).toBeGreaterThanOrEqual(1);
    expect(shiftKeys.every((k) => k.includes(lateEmployeeId))).toBe(true);
    expect(shiftKeys.some((k) => k.includes(leaveEmployeeId))).toBe(false);
    expect(shiftKeys.some((k) => k.includes(missingEmployeeId))).toBe(false);

    // 2nd run at +25m -> 100% idempotent, zero duplicate notifications
    const secondRun = await attendanceMonitorService.scanLateOrNoShow({
      now: new Date(`${workDateIso}T07:25:00.000+07:00`),
    });
    expect(
      secondRun.insertedDedupeKeys.filter((k) =>
        k.startsWith(`LATE_NO_SHOW:MGR:${shiftId}:`),
      ),
    ).toHaveLength(0);
    expect(secondRun.skippedDuplicates).toBeGreaterThanOrEqual(1);

    // Live UI query returns lateEmployeeId alert
    const alerts = await attendanceMonitorService.getActiveAttendanceAlerts({
      now: new Date(`${workDateIso}T07:25:00.000+07:00`),
      workDate: workDateIso,
    });
    expect(
      alerts.lateOrNoShows.some(
        (a) => a.shiftId === shiftId && a.employeeId === lateEmployeeId,
      ),
    ).toBe(true);
    expect(
      alerts.lateOrNoShows.some(
        (a) => a.shiftId === shiftId && a.employeeId === leaveEmployeeId,
      ),
    ).toBe(false);
  });

  it("flags missing clock-out after +60m idempotently and resolves cleanly via 1-tap quickFixClockOut", async () => {
    // At +30m after shift end (11:30 VN) -> NOT flagged yet
    await attendanceMonitorService.scanMissingClockOut({
      now: new Date(`${workDateIso}T11:30:00.000+07:00`),
    });
    const beforeFlag = await prisma.attendance.findUniqueOrThrow({
      where: { id: attendanceId },
    });
    expect(beforeFlag.isMissingClockOut).toBe(false);

    // At +65m after shift end (12:05 VN) -> flagged + notifies Employee & Owners/Managers
    const firstScan = await attendanceMonitorService.scanMissingClockOut({
      now: new Date(`${workDateIso}T12:05:00.000+07:00`),
    });
    const afterFlag = await prisma.attendance.findUniqueOrThrow({
      where: { id: attendanceId },
    });
    expect(afterFlag.isMissingClockOut).toBe(true);
    expect(afterFlag.anomalyStatus).toBe("MISSING_CLOCK_OUT");
    expect(afterFlag.completionStatus).toBe("INCOMPLETE");

    expect(firstScan.insertedDedupeKeys).toContain(
      `MISSING_CLOCK_OUT:EMP:${attendanceId}`,
    );
    expect(
      firstScan.insertedDedupeKeys.some((k) =>
        k.startsWith(`MISSING_CLOCK_OUT:MGR:${attendanceId}:`),
      ),
    ).toBe(true);

    // 2nd scan at +75m -> idempotent (0 new notifications for this attendance)
    const secondScan = await attendanceMonitorService.scanMissingClockOut({
      now: new Date(`${workDateIso}T12:15:00.000+07:00`),
    });
    expect(
      secondScan.insertedDedupeKeys.filter((k) => k.includes(attendanceId)),
    ).toHaveLength(0);

    // Live UI alerts include this missing clock-out with suggestedClockOut = shift.endAt
    const liveAlerts = await attendanceMonitorService.getActiveAttendanceAlerts({
      now: new Date(`${workDateIso}T12:15:00.000+07:00`),
      workDate: workDateIso,
    });
    const foundAlert = liveAlerts.missingClockOuts.find(
      (a) => a.attendanceId === attendanceId,
    );
    expect(foundAlert).toBeDefined();
    expect(foundAlert?.suggestedClockOut).toBe(shiftEndAt.toISOString());

    // EMPLOYEE role cannot call quickFixClockOut
    await expect(
      attendanceService.quickFixClockOut(employeeActor, attendanceId, {}),
    ).rejects.toThrow(/không được cấp quyền/);

    // Invalid clockOut before clockIn rejected
    await expect(
      attendanceService.quickFixClockOut(ownerActor, attendanceId, {
        clockOut: new Date(`${workDateIso}T06:50:00.000+07:00`).toISOString(),
      }),
    ).rejects.toThrow(/lớn hơn giờ vào ca/);

    // 1-tap quickFixClockOut with default shift.endAt
    const fixed = await attendanceService.quickFixClockOut(
      ownerActor,
      attendanceId,
      {},
    );
    expect(fixed.isMissingClockOut).toBe(false);
    expect(fixed.clockOut).toBe(shiftEndAt.toISOString());
    expect(fixed.status).toBe("APPROVED");
    expect(fixed.workedMinutes).toBe(238); // 07:02 -> 11:00
    expect(fixed.paidMinutes).toBe(240); // rounded to nearest 5m, capped at 240m
    expect(fixed.adjustmentReason).toContain("sửa giờ ra 1 chạm");
    expect(fixed.overtimeStatus).toBe("NONE");

    const dbFixed = await prisma.attendance.findUniqueOrThrow({
      where: { id: attendanceId },
    });
    expect(dbFixed.anomalyStatus).toBe("CLEAN"); // 2m late is within 5m grace period
    expect(dbFixed.actualLateMinutes).toBe(0);
    expect(dbFixed.penaltyLateMinutes).toBe(0);
  });
});
