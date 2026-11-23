import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { verifyPassword, type SessionUser } from "@/lib/auth";
import { credentialsService } from "@/modules/auth/credentials.service";
import { verifyEmployeePin } from "@/modules/availability/public-registration.service";
import { employeeCsvService } from "@/modules/employees/employee-csv.service";
import { executeGoLiveReset } from "@/modules/ops/go-live-reset.service";

describe("Pha 1 Integration Tests — Password/PIN, CSV Import & go-live-reset Safety", () => {
  const createdUserIds: string[] = [];
  const createdEmployeeIds: string[] = [];

  let ownerActor: SessionUser;
  let testEmpActor: SessionUser;
  let testEmpId: string;
  let testUserId: string;
  const suffix = Date.now().toString().slice(-6);
  const testCode = `TP1_${suffix}`;
  const testEmail = `pha1.emp.${suffix}@dlatcafe.test`;
  const testPhone = `0987${suffix}`;

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

    const pos = await prisma.position.findFirstOrThrow({
      where: { isActive: true },
    });

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: await (await import("bcryptjs")).default.hash("Initial@123", 10),
        role: "EMPLOYEE",
        isActive: true,
      },
    });
    testUserId = user.id;
    createdUserIds.push(user.id);

    const emp = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: testCode,
        fullName: "Nhân Viên Test Pha 1",
        phone: testPhone,
        email: testEmail,
        hireDate: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        primaryPositionId: pos.id,
      },
    });
    testEmpId = emp.id;
    createdEmployeeIds.push(emp.id);

    testEmpActor = {
      userId: user.id,
      email: user.email,
      role: "EMPLOYEE",
      employeeId: emp.id,
      fullName: emp.fullName,
    };
  });

  afterAll(async () => {
    if (createdEmployeeIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityId: { in: [...createdEmployeeIds, ...createdUserIds, "bulk_csv"] } },
            { userId: { in: createdUserIds } },
          ],
        },
      });
      await prisma.payRate.deleteMany({
        where: { employeeId: { in: createdEmployeeIds } },
      });
      await prisma.employmentHistory.deleteMany({
        where: { employeeId: { in: createdEmployeeIds } },
      });
      await prisma.employeeSkill.deleteMany({
        where: { employeeId: { in: createdEmployeeIds } },
      });
      await prisma.employee.deleteMany({
        where: { id: { in: createdEmployeeIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  it("allows employee to self-change password & PIN with bcrypt verification, and blocks wrong current password", async () => {
    // 1. Wrong current password -> rejected
    await expect(
      credentialsService.changeOwnPassword(testEmpActor, {
        currentPassword: "WrongPassword1",
        newPassword: "NewStrong@2026",
        confirmPassword: "NewStrong@2026",
      }),
    ).rejects.toThrow(/không chính xác/i);

    // 2. Weak new password -> rejected
    await expect(
      credentialsService.changeOwnPassword(testEmpActor, {
        currentPassword: "Initial@123",
        newPassword: "weak",
        confirmPassword: "weak",
      }),
    ).rejects.toThrow(/8 ký tự/);

    // 3. Valid password change -> succeeds & hashes with bcrypt
    await credentialsService.changeOwnPassword(testEmpActor, {
      currentPassword: "Initial@123",
      newPassword: "NewStrong@2026",
      confirmPassword: "NewStrong@2026",
    });

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: testUserId },
    });
    expect(await verifyPassword("NewStrong@2026", updatedUser.passwordHash)).toBe(
      true,
    );
    expect(await verifyPassword("Initial@123", updatedUser.passwordHash)).toBe(
      false,
    );

    // 4. Self change PIN using new password -> custom pinHash works & phone last-4 no longer works
    await credentialsService.changeOwnPin(testEmpActor, {
      currentPassword: "NewStrong@2026",
      newPin: "4829",
      confirmPin: "4829",
    });

    const updatedEmp = await prisma.employee.findUniqueOrThrow({
      where: { id: testEmpId },
    });
    expect(updatedEmp.pinHash).toBeTruthy();
    expect(
      await verifyEmployeePin(updatedEmp.phone, "4829", updatedEmp.pinHash),
    ).toBe(true);
    expect(
      await verifyEmployeePin(
        updatedEmp.phone,
        updatedEmp.phone.slice(-4),
        updatedEmp.pinHash,
      ),
    ).toBe(false);
  });

  it("allows OWNER to reset employee password/PIN and forbids EMPLOYEE from resetting others", async () => {
    await expect(
      credentialsService.resetEmployeeCredentials(testEmpActor, testEmpId, {
        newPin: "7391",
      }),
    ).rejects.toThrow(/không được cấp quyền/);

    const res = await credentialsService.resetEmployeeCredentials(
      ownerActor,
      testEmpId,
      {
        newPassword: "OwnerSet@2026",
        resetPinToDefault: true,
      },
    );
    expect(res.passwordUpdated).toBe(true);
    expect(res.pinResetToDefault).toBe(true);

    const [userAfter, empAfter] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: testUserId } }),
      prisma.employee.findUniqueOrThrow({ where: { id: testEmpId } }),
    ]);
    expect(await verifyPassword("OwnerSet@2026", userAfter.passwordHash)).toBe(
      true,
    );
    expect(empAfter.pinHash).toBeNull();
    expect(
      await verifyEmployeePin(
        empAfter.phone,
        empAfter.phone.slice(-4),
        empAfter.pinHash,
      ),
    ).toBe(true);
  });

  it("previews CSV with per-row duplicate/format errors and commits valid rows cleanly", async () => {
    const csvCodeValid = `CSV_${suffix}_1`;
    const csvEmailValid = `csv1.${suffix}@dlatcafe.test`;
    const csvPhoneValid = `0911${suffix}`;

    const csvText = [
      "ma_nv,ho_ten,email,so_dien_thoai,chuc_vu_chinh,luong_gio,gio_muc_tieu_tuan,gio_toi_da_tuan,ngay_vao_lam,vai_tro,mat_khau,ma_pin,ghi_chu",
      // Row 2: Valid
      `${csvCodeValid},Nguyễn CSV Hợp Lệ,${csvEmailValid},${csvPhoneValid},PHA_CHE,28000,30,48,2026-03-01,EMPLOYEE,CsvPass@123,2589,Barista mới`,
      // Row 3: Duplicate employeeCode with DB + duplicate phone with DB (formatted with spaces!)
      `${testCode},Trùng Mã Và SĐT,dup1.${suffix}@dlatcafe.test,${testPhone.slice(0, 4)} ${testPhone.slice(4)},PHA_CHE,26000,24,48,2026-03-01,EMPLOYEE,CsvPass@123,,`,
      // Row 4: Duplicate phone within CSV + bad email + unknown position + bad hourlyRate + invalid calendar date (Feb 31)
      `CSV_${suffix}_BAD,Dòng Lỗi Định Dạng,bad-email,${csvPhoneValid},KHONG_TON_TAI,500,50,40,2026-02-31,EMPLOYEE,CsvPass@123,0000,`,
    ].join("\r\n");

    const preview = await employeeCsvService.previewImport(ownerActor, csvText);
    expect(preview.totalRows).toBe(3);
    expect(preview.validCount).toBe(1);
    expect(preview.errorCount).toBe(2);

    const row2 = preview.rows[0]!;
    expect(row2.status).toBe("VALID");

    const row3 = preview.rows[1]!;
    expect(row3.status).toBe("ERROR");
    expect(row3.errors.some((e) => e.includes("Trùng mã nhân viên"))).toBe(true);
    expect(row3.errors.some((e) => e.includes("Trùng SĐT"))).toBe(true);

    const row4 = preview.rows[2]!;
    expect(row4.status).toBe("ERROR");
    expect(row4.errors.some((e) => e.includes("Email sai định dạng"))).toBe(true);
    expect(row4.errors.some((e) => e.includes("Trùng SĐT"))).toBe(true);
    expect(row4.errors.some((e) => e.includes("không tồn tại"))).toBe(true);
    expect(row4.errors.some((e) => e.includes("Lương giờ"))).toBe(true);
    expect(row4.errors.some((e) => e.includes("Ngày vào làm"))).toBe(true);

    // Committing without skipInvalid must reject
    await expect(
      employeeCsvService.commitImport(ownerActor, csvText, {
        skipInvalid: false,
      }),
    ).rejects.toThrow(/dòng lỗi/);

    // Committing with skipInvalid: true persists the 1 valid row
    const commit = await employeeCsvService.commitImport(ownerActor, csvText, {
      skipInvalid: true,
    });
    expect(commit.createdCount).toBe(1);
    expect(commit.skippedCount).toBe(2);
    expect(commit.createdEmployees[0]?.employeeCode).toBe(csvCodeValid);

    const createdEmp = await prisma.employee.findUniqueOrThrow({
      where: { employeeCode: csvCodeValid },
      include: { payRates: true, skills: true },
    });
    createdEmployeeIds.push(createdEmp.id);
    createdUserIds.push(createdEmp.userId);
    expect(createdEmp.payRates[0]?.hourlyRate).toBe(28000n);
    expect(createdEmp.skills.length).toBeGreaterThanOrEqual(1);
    expect(
      await verifyEmployeePin(createdEmp.phone, "2589", createdEmp.pinHash),
    ).toBe(true);
  });

  it("enforces go-live-reset safety guards and preserves SystemSetting & CA_1..CA_4 in --dry-run", async () => {
    await expect(
      executeGoLiveReset(prisma, { dryRun: false, confirm: false }),
    ).rejects.toThrow(/--dry-run/);

    await expect(
      executeGoLiveReset(prisma, {
        dryRun: true,
        confirm: false,
        owner: {
          email: "not-an-email",
          password: "StrongPassword@2026",
          fullName: "Chủ Quán",
          phone: "0909123456",
        },
      }),
    ).rejects.toThrow(/Email Chủ quán/);

    await expect(
      executeGoLiveReset(prisma, {
        dryRun: true,
        confirm: false,
        owner: {
          email: "owner@dlatcafe.vn",
          password: "StrongPassword@2026",
          fullName: "Chủ Quán",
          phone: "123",
        },
      }),
    ).rejects.toThrow(/Số điện thoại Chủ quán/);

    const userCountBefore = await prisma.user.count();
    const dryReport = await executeGoLiveReset(prisma, {
      dryRun: true,
      confirm: false,
    });

    expect(dryReport.mode).toBe("DRY_RUN");
    expect(dryReport.wouldDeleteOrDeleted.users).toBe(userCountBefore);
    expect(dryReport.preserved.systemSettingKeys.length).toBeGreaterThan(0);
    expect(dryReport.preserved.shiftTemplateCodes).toEqual(
      expect.arrayContaining(["CA_1", "CA_2", "CA_3", "CA_4"]),
    );

    // Verify NOTHING was deleted
    expect(await prisma.user.count()).toBe(userCountBefore);
  });
});
