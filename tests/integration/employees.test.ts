import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppForbiddenError } from "@/lib/permissions";
import { employeeService } from "@/modules/employees/employee.service";
import type { SessionUser } from "@/lib/auth";

let ownerActor: SessionUser;
let managerActor: SessionUser;
let employeeActor: SessionUser;
let otherEmployeeId: string;
let baristaPositionId: string;
let cashierPositionId: string;

describe("Employee Management, PayRate History & RBAC Integration Tests", () => {
  beforeAll(async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "owner@dlatcafe.vn" },
      include: { employee: true },
    });
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: "manager@dlatcafe.vn" },
      include: { employee: true },
    });
    const emp1 = await prisma.user.findUniqueOrThrow({
      where: { email: "nam.le@dlatcafe.vn" },
      include: { employee: true },
    });
    const emp2 = await prisma.user.findUniqueOrThrow({
      where: { email: "bao.vo@dlatcafe.vn" },
      include: { employee: true },
    });

    const baristaPos = await prisma.position.findUniqueOrThrow({
      where: { code: "PHA_CHE" },
    });
    const cashierPos = await prisma.position.findUniqueOrThrow({
      where: { code: "THU_NGAN" },
    });

    baristaPositionId = baristaPos.id;
    cashierPositionId = cashierPos.id;
    otherEmployeeId = emp2.employee!.id;

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
    employeeActor = {
      userId: emp1.id,
      email: emp1.email,
      role: emp1.role,
      employeeId: emp1.employee!.id,
      fullName: emp1.employee!.fullName,
    };
  });

  it("allows EMPLOYEE to view own profile and pay rate, but blocks horizontal IDOR on another employee", async () => {
    const ownProfile = await employeeService.getEmployeeById(
      employeeActor,
      employeeActor.employeeId!,
    );
    expect(ownProfile.email).toBe("nam.le@dlatcafe.vn");
    expect(ownProfile.currentHourlyRate).toBe("32000");

    await expect(
      employeeService.getEmployeeById(employeeActor, otherEmployeeId),
    ).rejects.toThrow(AppForbiddenError);

    await expect(
      employeeService.listEmployees(employeeActor, {}),
    ).rejects.toThrow(AppForbiddenError);
  });

  it("allows MANAGER to list directory and filter by status/search, while blocking wage modifications", async () => {
    const activeList = await employeeService.listEmployees(managerActor, {
      status: "ACTIVE",
    });
    expect(activeList.length).toBeGreaterThanOrEqual(10);
    expect(activeList.every((e) => e.status === "ACTIVE")).toBe(true);

    await expect(
      employeeService.addPayRate(managerActor, otherEmployeeId, {
        hourlyRate: 35000,
        effectiveFrom: "2026-12-01",
        note: "Thử tự ý tăng lương",
      }),
    ).rejects.toThrow(AppForbiddenError);
  });

  it("creates an employee transactionally with User, multi-skills, initial PayRate, EmploymentHistory, and preserves history on wage change & deactivation", async () => {
    const suffix = Date.now().toString().slice(-5);
    const created = await employeeService.createEmployee(ownerActor, {
      employeeCode: `NVT${suffix}`,
      fullName: `Trần Minh Thử ${suffix}`,
      email: `test.${suffix}@dlatcafe.vn`,
      phone: "0909888777",
      password: "Password@123",
      role: "EMPLOYEE",
      hireDate: "2026-10-01",
      primaryPositionId: baristaPositionId,
      skills: [
        { positionId: baristaPositionId, proficiency: "INTERMEDIATE" },
        { positionId: cashierPositionId, proficiency: "BASIC" },
      ],
      hourlyRate: 25000,
      weeklyTargetHours: 28,
      maxWeeklyHours: 40,
      fixedRestDay: 3,
      internalNotes: "Nhân sự kiểm thử tự động",
    });

    expect(created.employeeCode).toBe(`NVT${suffix}`);
    expect(created.skills).toHaveLength(2);
    expect(created.currentHourlyRate).toBe("25000");
    expect(created.payRates).toHaveLength(1);
    expect(created.employmentHistory.length).toBeGreaterThanOrEqual(1);

    // Update wage -> closes old PayRate, inserts new PayRate (no overwrite!)
    const afterRaise = await employeeService.addPayRate(ownerActor, created.id, {
      hourlyRate: 29000,
      effectiveFrom: "2026-11-15",
      note: "Tăng lương sau thử việc",
    });
    expect(afterRaise.payRates).toHaveLength(2);
    expect(afterRaise.currentHourlyRate).toBe("29000");
    const closedRate = afterRaise.payRates.find(
      (r) => r.hourlyRate === "25000",
    );
    expect(closedRate?.effectiveTo).not.toBeNull();

    // Soft-deactivate employee -> sets status INACTIVE and User.isActive = false
    const deactivated = await employeeService.setEmployeeStatus(
      ownerActor,
      created.id,
      {
        status: "INACTIVE",
        reason: "Nghỉ ôn thi học kỳ",
      },
    );
    expect(deactivated.status).toBe("INACTIVE");

    const dbUser = await prisma.user.findUniqueOrThrow({
      where: { id: created.userId },
    });
    expect(dbUser.isActive).toBe(false);

    // Verify historical PayRates and EmploymentHistory remain intact
    const preserved = await employeeService.getEmployeeById(
      ownerActor,
      created.id,
    );
    expect(preserved.payRates).toHaveLength(2);
    expect(
      preserved.employmentHistory.some((h) => h.eventType === "DEACTIVATED"),
    ).toBe(true);
  });
});

