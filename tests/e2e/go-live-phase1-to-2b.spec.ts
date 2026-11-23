import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  BASE_URL,
  MOBILE_VIEWPORTS,
  SEEDED_USERS,
  assertNoHorizontalOverflow,
  assertTouchTargetsMinSize,
  authHeadersFor,
  loginViaApi,
} from "./helpers/req-e2e-helpers";

const prisma = new PrismaClient();

test.describe("Go-Live Phases 1, 2A & 2B — Full Browser E2E (Desktop + Mobile 375x812)", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. Pha 1: Self-service Change Password (Owner) & Change PIN (Employee)
  // =========================================================================
  test("GL-01: Owner changes password via ManagementShell modal and restores original password", async ({
    page,
    request,
  }) => {
    const originalPw = SEEDED_USERS.owner.password;
    const tempPw = "OwnerNew@2026";
    let changed = false;

    try {
      await loginViaApi(page, "owner");
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForLoadState("networkidle");

      // Open modal via header button
      await page.locator('button[aria-label="Đổi mật khẩu và mã PIN"]').click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Wrong current password -> error
      await dialog.locator("#cp-current").fill("WrongPass@999");
      await dialog.locator("#cp-new").fill(tempPw);
      await dialog.locator("#cp-confirm").fill(tempPw);
      await dialog.getByRole("button", { name: /Lưu mật khẩu mới/i }).click();
      await expect(dialog.locator(".text-red-700")).toBeVisible({ timeout: 10000 });

      // Correct current password -> success
      await dialog.locator("#cp-current").fill(originalPw);
      await dialog.locator("#cp-new").fill(tempPw);
      await dialog.locator("#cp-confirm").fill(tempPw);
      await dialog.getByRole("button", { name: /Lưu mật khẩu mới/i }).click();
      await expect(dialog.getByText(/Đã đổi mật khẩu đăng nhập thành công/i)).toBeVisible({
        timeout: 10000,
      });
      changed = true;

      // Verify login with new password works via API
      const loginNewRes = await request.post(`${BASE_URL}/api/auth/login`, {
        data: { email: SEEDED_USERS.owner.email, password: tempPw },
      });
      expect(loginNewRes.status()).toBe(200);
    } finally {
      if (changed) {
        const loginTempRes = await request.post(`${BASE_URL}/api/auth/login`, {
          data: { email: SEEDED_USERS.owner.email, password: tempPw },
        });
        const setCookie = loginTempRes.headers()["set-cookie"] ?? "";
        const cookieVal = setCookie.split(";")[0] ?? "";
        if (cookieVal) {
          await request.post(`${BASE_URL}/api/auth/change-password`, {
            headers: { cookie: cookieVal },
            data: {
              currentPassword: tempPw,
              newPassword: originalPw,
              confirmPassword: originalPw,
            },
          });
        }
      }
    }
  });

  test("GL-02: Employee changes schedule registration PIN via /employee/profile and restores original PIN", async ({
    page,
    request,
  }) => {
    const emp = SEEDED_USERS.employeeKiet;
    const tempPin = "8822";
    let pinChanged = false;

    const beforeEmp = await prisma.employee.findUnique({
      where: { employeeCode: emp.code },
      select: { pinHash: true },
    });

    try {
      await loginViaApi(page, "employeeKiet");
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: /Đổi mã PIN đăng ký ca/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await dialog.locator("#pin-current-pw").fill(emp.password);
      await dialog.locator("#pin-new").fill(tempPin);
      await dialog.locator("#pin-confirm").fill(tempPin);
      await dialog.getByRole("button", { name: /Lưu mã PIN mới/i }).click();

      await expect(dialog.getByText(/Đã cập nhật mã PIN đăng ký ca mới/i)).toBeVisible({
        timeout: 10000,
      });
      pinChanged = true;

      // Verify new PIN hash persisted in DB and differs from previous hash
      const afterEmp = await prisma.employee.findUnique({
        where: { employeeCode: emp.code },
        select: { pinHash: true },
      });
      expect(afterEmp?.pinHash).toBeTruthy();
      expect(afterEmp?.pinHash).not.toBe(beforeEmp?.pinHash);
    } finally {
      if (pinChanged) {
        const empHeaders = await authHeadersFor(request, "employeeKiet");
        await request.post(`${BASE_URL}/api/auth/change-pin`, {
          headers: empHeaders,
          data: {
            currentPassword: emp.password,
            newPin: emp.pin,
            confirmPin: emp.pin,
          },
        });
      }
    }
  });

  // =========================================================================
  // 2. Pha 1: CSV Employee Import on /employees (Invalid row + Valid commit)
  // =========================================================================
  test("GL-03: Owner imports employees via CSV on /employees (validates error rows & commits valid row)", async ({
    page,
    request,
  }) => {
    const uniqueSuffix = Date.now().toString().slice(-4);
    const validCode = `NV9${uniqueSuffix}`;
    const validEmail = `csv.e2e.${uniqueSuffix}@dlatcafe.vn`;
    const validPhone = `098811${uniqueSuffix}`;

    try {
      const ownerHeaders = await authHeadersFor(request, "owner");

      // Verify template CSV download endpoint
      const tplRes = await request.get(`${BASE_URL}/api/employees/import-csv/template`, {
        headers: ownerHeaders,
      });
      expect(tplRes.status()).toBe(200);
      const tplText = await tplRes.text();
      expect(tplText).toContain("ma_nv");

      await loginViaApi(page, "owner");
      await page.goto(`${BASE_URL}/employees`);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: /Nhập từ CSV/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Open paste area
      await dialog.locator("summary", { hasText: /Hoặc dán trực tiếp nội dung CSV/i }).click();

      const csvContent = [
        "ma_nv,ho_ten,email,so_dien_thoai,chuc_vu_chinh,luong_gio,gio_muc_tieu_tuan,gio_toi_da_tuan,ngay_vao_lam",
        // Invalid row: duplicate email & phone of seeded employeeNam
        `NV003,Trùng Dữ Liệu,${SEEDED_USERS.employeeNam.email},${SEEDED_USERS.employeeNam.phone},PHA_CHE,25000,24,48,2026-11-01`,
        // Valid new employee row
        `${validCode},Nhân Viên CSV E2E,${validEmail},${validPhone},PHA_CHE,26000,24,48,2026-11-01`,
      ].join("\n");

      await dialog.locator("textarea").fill(csvContent);
      await dialog.getByRole("button", { name: /Xem trước & Kiểm tra lỗi/i }).click();

      // Expect 1 valid, 1 error in preview badges
      await expect(dialog.getByText(/Hợp lệ:\s*1/)).toBeVisible({ timeout: 10000 });
      await expect(dialog.getByText(/Lỗi:\s*1/)).toBeVisible({ timeout: 10000 });

      // Commit with skipInvalid checked (default true)
      await dialog.getByRole("button", { name: /Lưu 1 nhân viên hợp lệ|Xác nhận nhập/i }).click();
      await expect(dialog.getByText(/Đã nhập thành công 1 nhân viên/i)).toBeVisible({
        timeout: 15000,
      });

      // Verify persisted in DB
      const createdEmp = await prisma.employee.findUnique({
        where: { employeeCode: validCode },
      });
      expect(createdEmp).not.toBeNull();
      expect(createdEmp?.fullName).toBe("Nhân Viên CSV E2E");
    } finally {
      // Cleanup created test employee & user
      const emp = await prisma.employee.findUnique({
        where: { employeeCode: validCode },
      });
      if (emp) {
        await prisma.payRate.deleteMany({ where: { employeeId: emp.id } });
        await prisma.employmentHistory.deleteMany({ where: { employeeId: emp.id } });
        await prisma.employeeSkill.deleteMany({ where: { employeeId: emp.id } });
        await prisma.employee.delete({ where: { id: emp.id } });
        await prisma.user.deleteMany({ where: { id: emp.userId } });
      }
    }
  });

  // =========================================================================
  // 3. Pha 2A: Attendance Anomalies Cron (+15m Late/No-Show, +60m Missing Clock-Out)
  //            & One-Tap Clock-Out Fix on /dashboard
  // =========================================================================
  test("GL-04: Anomaly cron flags late/no-show (+15m) & missing clock-out (+60m) idempotently, and 1-tap fix works on /dashboard", async ({
    page,
    request,
  }) => {
    const ownerHeaders = await authHeadersFor(request, "owner");

    // Pick 2 active employees not likely colliding
    const [empMissing, empLate, pos] = await Promise.all([
      prisma.employee.findUniqueOrThrow({ where: { employeeCode: SEEDED_USERS.employeeChau.code } }),
      prisma.employee.findUniqueOrThrow({ where: { employeeCode: SEEDED_USERS.employeeQuan.code } }),
      prisma.position.findFirstOrThrow({ where: { isActive: true } }),
    ]);

    // Build a shift today that started 3.5h ago and ended 75m ago so BOTH +15m late/no-show and +60m missing clock-out trigger NOW
    const now = new Date();
    const vnOffsetMs = 7 * 60 * 60 * 1000;
    const vnNow = new Date(now.getTime() + vnOffsetMs);
    const todayIso = vnNow.toISOString().slice(0, 10);
    const todayUtc = new Date(`${todayIso}T00:00:00.000Z`);

    // Ensure shift stays within a reasonable window relative to `now`
    const shiftEndAt = new Date(now.getTime() - 75 * 60_000); // ended 75m ago (>60m)
    const shiftStartAt = new Date(shiftEndAt.getTime() - 120 * 60_000); // 2h shift
    const clockInAt = new Date(shiftStartAt.getTime() + 2 * 60_000);

    // Find or create a published schedule for the week of todayIso
    const dayOfWeek = todayUtc.getUTCDay(); // 0=Sun..6=Sat
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayUtc = new Date(todayUtc.getTime() + diffToMon * 86400_000);

    let createdScheduleId: string | null = null;
    let schedule = await prisma.schedule.findUnique({ where: { weekStart: mondayUtc } });
    if (!schedule) {
      schedule = await prisma.schedule.create({
        data: {
          weekStart: mondayUtc,
          name: `E2E Anomaly Week ${todayIso}`,
          status: "PUBLISHED",
        },
      });
      createdScheduleId = schedule.id;
    } else if (schedule.status === "DRAFT") {
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: { status: "PUBLISHED" },
      });
    }

    const shift = await prisma.shift.create({
      data: {
        scheduleId: schedule.id,
        name: "Ca E2E Bất Thường",
        workDate: todayUtc,
        startAt: shiftStartAt,
        endAt: shiftEndAt,
        breakMinutes: 0,
        isPaidBreak: true,
        requiredStaff: 2,
        status: "ASSIGNED",
      },
    });

    let attendanceId: string | null = null;
    try {
      await prisma.shiftAssignment.createMany({
        data: [
          { shiftId: shift.id, employeeId: empMissing.id, positionId: pos.id, status: "ASSIGNED" },
          { shiftId: shift.id, employeeId: empLate.id, positionId: pos.id, status: "ASSIGNED" },
        ],
      });

      const att = await prisma.attendance.create({
        data: {
          employeeId: empMissing.id,
          shiftId: shift.id,
          workDate: todayUtc,
          clockIn: clockInAt,
          clockOut: null,
          scheduledMinutes: 120,
          workedMinutes: 0,
          status: "PENDING",
          isMissingClockOut: false,
        },
      });
      attendanceId = att.id;

      // Call cron #1
      const cronRes1 = await request.post(`${BASE_URL}/api/cron/attendance-anomalies`, {
        headers: ownerHeaders,
      });
      expect(cronRes1.status()).toBe(200);
      const cronJson1 = await cronRes1.json();
      expect(cronJson1.ok).toBe(true);
      expect(cronJson1.data.missingClockOut.newlyFlaggedCount).toBeGreaterThanOrEqual(1);
      expect(cronJson1.data.lateOrNoShow.detectedLateOrNoShow).toBeGreaterThanOrEqual(1);
      expect(cronJson1.data.lateOrNoShow.notificationsCreated).toBeGreaterThanOrEqual(1);

      // Call cron #2 immediately -> idempotent (0 new notifications for same shift)
      const cronRes2 = await request.post(`${BASE_URL}/api/cron/attendance-anomalies`, {
        headers: ownerHeaders,
      });
      expect(cronRes2.status()).toBe(200);
      const cronJson2 = await cronRes2.json();
      expect(cronJson2.ok).toBe(true);
      expect(cronJson2.data.missingClockOut.newlyFlaggedCount).toBe(0);
      expect(cronJson2.data.missingClockOut.notificationsCreated).toBe(0);
      expect(cronJson2.data.lateOrNoShow.notificationsCreated).toBe(0);

      // Verify alerts also render on /attendance before fixing on /dashboard
      await loginViaApi(page, "owner");
      await page.goto(`${BASE_URL}/attendance`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/Quên chấm công ra \(\+60p\)/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Đi trễ \/ Vắng mặt không phép \(\+15p\)/i)).toBeVisible({
        timeout: 10000,
      });

      // Open /dashboard in real browser and verify alerts + 1-tap fix button
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForLoadState("networkidle");

      await expect(page.getByText(/Quên chấm công ra \(\+60p\)/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Đi trễ \/ Vắng mặt không phép \(\+15p\)/i)).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText(empMissing.fullName).first()).toBeVisible();
      await expect(page.getByText(empLate.fullName).first()).toBeVisible();

      // Click 1-tap fix button for empMissing
      const fixBtn = page.getByRole("button", { name: /Sửa giờ ra/i }).first();
      await expect(fixBtn).toBeVisible();
      await fixBtn.click();

      await expect(page.getByText(/Đã cập nhật giờ ra/i)).toBeVisible({ timeout: 10000 });

      // Confirm DB updated
      const updatedAtt = await prisma.attendance.findUnique({ where: { id: att.id } });
      expect(updatedAtt?.clockOut).not.toBeNull();
      expect(updatedAtt?.isMissingClockOut).toBe(false);
      expect(updatedAtt?.status).toBe("APPROVED");
    } finally {
      if (attendanceId) {
        await prisma.attendanceAdjustmentRequest.deleteMany({ where: { attendanceId } });
        await prisma.attendanceEvent.deleteMany({ where: { attendanceId } });
        await prisma.attendance.deleteMany({ where: { id: attendanceId } });
      }
      await prisma.shiftAssignment.deleteMany({ where: { shiftId: shift.id } });
      await prisma.shift.deleteMany({ where: { id: shift.id } });
      if (createdScheduleId) {
        await prisma.schedule.deleteMany({ where: { id: createdScheduleId } });
      }
      await prisma.notification.deleteMany({
        where: {
          message: { contains: "Ca E2E Bất Thường" },
        },
      });
    }
  });

  // =========================================================================
  // 4. Pha 2B: Mobile 375x812 Zero-Overflow, >=44px Touch Targets & Dashboard Quick Summary
  // =========================================================================
  test("GL-05: All 8 Owner management pages have 0 horizontal overflow, >=44px primary buttons, and Dashboard Quick Summary at 375x812", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
    await loginViaApi(page, "owner");

    // 1. /dashboard — check Quick Summary cards + mobile menu drawer + touch targets + 0 overflow
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalOverflow(page, "/dashboard @ 375x812");

    const quickSummary = page.locator('[data-testid="owner-quick-summary"]');
    await expect(quickSummary).toBeVisible();
    await expect(quickSummary).toContainText(/Chi phí nhân sự ước tính/i);
    await expect(quickSummary).toContainText(/Tổng chênh lệch két bàn giao/i);
    await expect(quickSummary).toContainText(/Cảnh báo ca bất thường hôm nay/i);

    await assertTouchTargetsMinSize(
      [
        page.locator('button[aria-label="Mở menu quản lý"]'),
        page.locator('button[title="Thông báo"]'),
        page.locator('button[aria-label="Đổi mật khẩu và mã PIN"]'),
        page.locator('button[aria-label="Đăng xuất"]'),
        page.getByRole("link", { name: /Quản lý nhân sự/i }),
        page.getByRole("link", { name: /Xem bảng lương/i }),
      ],
      44,
      44,
      "/dashboard mobile header & primary links",
    );

    // Open mobile menu drawer & verify links are reachable and >=44px
    await page.locator('button[aria-label="Mở menu quản lý"]').click();
    const drawer = page.locator('[aria-label="Menu điều hướng quản lý"]');
    await expect(drawer).toBeVisible();
    await assertTouchTargetsMinSize(
      [
        drawer.getByRole("link", { name: /Duyệt đơn/i }),
        drawer.getByRole("link", { name: /Báo cáo/i }),
        drawer.getByRole("link", { name: /Cài đặt quán/i }),
      ],
      44,
      44,
      "Mobile drawer links",
    );
    await drawer.locator('button[aria-label="Đóng menu"]').click();
    await expect(drawer).toHaveCount(0);

    // 2. Remaining 7 management routes at 375x812
    const managementPages: Array<{ route: string; primarySelector: string }> = [
      { route: "/schedules", primarySelector: 'button:has-text("Mã QR Đăng Ký")' },
      { route: "/attendance", primarySelector: 'button:has-text("Mở Kiosk Chấm công")' },
      { route: "/payroll", primarySelector: 'button:has-text("Tạo kỳ lương mới")' },
      { route: "/reports", primarySelector: 'button:has-text("Xuất Báo cáo Chấm công")' },
      { route: "/employees", primarySelector: 'button:has-text("Nhập từ CSV")' },
      { route: "/settings", primarySelector: 'button:has-text("Lưu thay đổi")' },
      { route: "/requests", primarySelector: 'button:has-text("Đơn xin nghỉ phép")' },
    ];

    for (const item of managementPages) {
      await page.goto(`${BASE_URL}${item.route}`);
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page, `${item.route} @ 375x812`);
      await assertTouchTargetsMinSize(
        [page.locator(item.primarySelector).first()],
        44,
        44,
        `${item.route} primary action`,
      );
    }

    // 3. Interactive sub-views & tabs at 375x812 (catch inner layout overflows)
    await page.goto(`${BASE_URL}/schedules`);
    await page.waitForLoadState("networkidle");
    for (const modeLabel of ["Theo Ngày", "Theo Nhân viên", "Danh sách Ca"]) {
      await page.getByRole("button", { name: modeLabel }).click();
      await page.waitForTimeout(200);
      await assertNoHorizontalOverflow(page, `/schedules [${modeLabel}] @ 375x812`);
    }

    await page.goto(`${BASE_URL}/attendance`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Bảng tổng hợp công kỳ/i }).click();
    await page.waitForTimeout(400);
    await assertNoHorizontalOverflow(page, "/attendance [TIMESHEET] @ 375x812");
    await assertTouchTargetsMinSize(
      [
        page.getByRole("button", { name: /Kỳ 1 \(01 - 15\)/i }),
        page.getByRole("button", { name: /Tải dữ liệu/i }),
      ],
      44,
      44,
      "/attendance [TIMESHEET] mobile controls",
    );

    await page.goto(`${BASE_URL}/requests`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Yêu cầu đổi ca/i }).click();
    await page.waitForTimeout(200);
    await assertNoHorizontalOverflow(page, "/requests [SWAPS] @ 375x812");
  });

  test("GL-06: Detail routes /employees/[id] and /payroll/[id] have 0 horizontal overflow and >=44px primary buttons at 375x812", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
    await loginViaApi(page, "owner");

    // 1. /employees/[id]
    const sampleEmployee = await prisma.employee.findUniqueOrThrow({
      where: { employeeCode: SEEDED_USERS.employeeNam.code },
      select: { id: true, fullName: true },
    });

    await page.goto(`${BASE_URL}/employees/${sampleEmployee.id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: sampleEmployee.fullName })).toBeVisible();
    await assertNoHorizontalOverflow(page, `/employees/${sampleEmployee.id} @ 375x812`);
    await assertTouchTargetsMinSize(
      [
        page.getByRole("link", { name: /Quay lại danh bạ nhân sự/i }),
        page.getByRole("button", { name: /Điều chỉnh lương/i }),
        page.getByRole("button", { name: /Cấp lại MK \/ PIN/i }),
        page.getByRole("button", { name: /Chỉnh sửa/i }),
        page.getByRole("button", { name: /Khóa \/ Nghỉ việc|Kích hoạt lại/i }),
      ],
      44,
      44,
      "/employees/[id] mobile primary actions",
    );

    // Open Edit Profile modal at 375x812 and verify 0 overflow + >=44px modal buttons
    await page.getByRole("button", { name: /Chỉnh sửa/i }).click();
    const editEmpDialog = page.getByRole("dialog");
    await expect(editEmpDialog).toBeVisible();
    await assertNoHorizontalOverflow(page, `/employees/${sampleEmployee.id} [Edit Modal] @ 375x812`);
    await assertTouchTargetsMinSize(
      [
        editEmpDialog.getByRole("button", { name: /^Hủy$/i }),
        editEmpDialog.getByRole("button", { name: /Lưu cập nhật/i }),
      ],
      44,
      44,
      "/employees/[id] Edit Profile modal buttons",
    );
    await editEmpDialog.getByRole("button", { name: /^Hủy$/i }).click();
    await expect(editEmpDialog).toHaveCount(0);

    // 2. /payroll/[id] — create a deterministic CALCULATED period with a full item (OT + allowances + deductions)
    // so mobile card view, lifecycle buttons, Phiếu lương, Sửa, and Edit modal are always exercised
    let tempPeriodId: string | null = null;
    try {
      const created = await prisma.payrollPeriod.create({
        data: {
          name: `E2E Mobile Payroll ${Date.now()}`,
          periodStart: new Date("2026-10-01T00:00:00.000Z"),
          periodEnd: new Date("2026-10-15T00:00:00.000Z"),
          status: "CALCULATED",
          items: {
            create: {
              employeeId: sampleEmployee.id,
              scheduledHours: 48,
              workedHours: 50.5,
              approvedHours: 50.5,
              paidHours: 50.5,
              overtimeHours: 2.5,
              hourlyRateSnapshot: 30000n,
              basePay: 1440000n,
              overtimePay: 112500n,
              allowances: 150000n,
              bonuses: 100000n,
              deductions: 50000n,
              adjustments: 0n,
              totalPay: 1752500n,
            },
          },
        },
        select: { id: true, name: true },
      });
      tempPeriodId = created.id;

      await page.goto(`${BASE_URL}/payroll/${created.id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: created.name })).toBeVisible();
      await assertNoHorizontalOverflow(page, `/payroll/${created.id} @ 375x812`);

      const payslipBtn = page.getByRole("button", { name: /Phiếu lương/i }).first();
      const editItemBtn = page.getByRole("button", { name: /^Sửa$/i }).first();
      await expect(payslipBtn).toBeVisible();
      await expect(editItemBtn).toBeVisible();

      await assertTouchTargetsMinSize(
        [
          page.getByRole("button", { name: /Kỳ lương/i }),
          page.getByRole("button", { name: /Xuất CSV \(Excel\)/i }),
          page.getByRole("button", { name: /Nhập giờ từ Excel/i }),
          page.getByRole("button", { name: /Tính toán từ chấm công/i }),
          page.getByRole("button", { name: /Xác nhận Rà soát/i }),
          payslipBtn,
          editItemBtn,
        ],
        44,
        44,
        "/payroll/[id] mobile primary & card actions",
      );

      // Open Edit Payroll Item modal at 375x812 and verify 0 overflow + >=44px buttons
      await editItemBtn.click();
      const editItemDialog = page.getByRole("dialog");
      await expect(editItemDialog).toBeVisible();
      await assertNoHorizontalOverflow(page, `/payroll/${created.id} [Edit Item Modal] @ 375x812`);
      await assertTouchTargetsMinSize(
        [
          editItemDialog.getByRole("button", { name: /^Hủy$/i }),
          editItemDialog.getByRole("button", { name: /Lưu thay đổi/i }),
        ],
        44,
        44,
        "/payroll/[id] Edit Item modal buttons",
      );
      await editItemDialog.getByRole("button", { name: /^Hủy$/i }).click();
      await expect(editItemDialog).toHaveCount(0);
    } finally {
      if (tempPeriodId) {
        await prisma.payrollItem.deleteMany({ where: { payrollPeriodId: tempPeriodId } });
        await prisma.payrollPeriod.deleteMany({ where: { id: tempPeriodId } });
      }
    }
  });
});
