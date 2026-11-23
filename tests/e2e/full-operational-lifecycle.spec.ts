import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  MOBILE_VIEWPORTS,
  SEEDED_USERS,
  apiJson,
  assertNoHorizontalOverflow,
  assignEmployeeToShift,
  authHeadersFor,
  changeScheduleStatus,
  clearSession,
  createScheduleWeek,
  createShiftInSchedule,
  ensureEditableWeekForDate,
  findEmployeeByCode,
  findUnusedFutureMonday,
  getVNClockNow,
  loginViaApi,
} from "./helpers/req-e2e-helpers";

test.describe.serial("Full Operational Lifecycle E2E (Desktop & Mobile 375x812)", () => {
  // =========================================================================
  // STAGE 1: Public /register-schedule (Mobile 375x812)
  // =========================================================================
  test("Stage 1: /register-schedule has no 'Mã QR Nhanh', no 'Trưởng ca', proper 'PÁ' initials, PIN auth, switch staff, submit & deadline check", async ({
    browser,
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    const futureMonday = await findUnusedFutureMonday(request, managerHeaders, 170);
    await createScheduleWeek(request, managerHeaders, futureMonday, true);

    const context = await browser.newContext({
      viewport: MOBILE_VIEWPORTS.sm375,
    });
    const page = await context.newPage();

    try {
      await page.goto(`${BASE_URL}/register-schedule?week=${futureMonday}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByRole("heading", { name: /Đăng Ký Ca Làm Việc/i })).toBeVisible();

      // Q1: No static "Mã QR Nhanh" badge in header
      await expect(page.getByText("Mã QR Nhanh")).toHaveCount(0);

      // Q2: No "Trưởng ca" badge anywhere in employee list or after selecting Phạm Ngọc Ánh
      await expect(page.getByText("Trưởng ca")).toHaveCount(0);

      await assertNoHorizontalOverflow(page, "/register-schedule mobile 375px");

      // Select Phạm Ngọc Ánh (NV004)
      await page.getByPlaceholder(/Gõ tên hoặc mã nhân viên/i).fill("Phạm Ngọc Ánh");
      await page.getByRole("button", { name: /Phạm Ngọc Ánh/i }).click();

      // Verify initials avatar shows "PÁ" (not "nh") and still no "Trưởng ca" badge
      const avatar = page.getByTestId("employee-initials-avatar");
      await expect(avatar).toHaveText("PÁ");
      await expect(page.getByText("Trưởng ca")).toHaveCount(0);

      // Test wrong PIN first
      const pinInput = page.locator('input[inputmode="numeric"]');
      const wrongPinResp = page.waitForResponse((r) => r.url().includes("pin=0000"));
      await pinInput.fill("0000");
      await wrongPinResp;
      await expect(page.getByText(/không đúng|sai/i)).toBeVisible({ timeout: 5000 });

      // Test correct PIN for Phạm Ngọc Ánh (4555)
      const rightPinRespPromise = page.waitForResponse((r) =>
        r.url().includes(`pin=${SEEDED_USERS.employeeAnh.pin}`),
      );
      await pinInput.fill("");
      await pinInput.fill(SEEDED_USERS.employeeAnh.pin);
      const rightPinResp = await rightPinRespPromise;
      expect(rightPinResp.status()).toBe(200);
      await expect(page.getByText("✓ Đã xác thực")).toBeVisible({ timeout: 5000 });

      // Quick-select morning shifts & submit
      await page.getByRole("button", { name: /Rảnh mọi Ca 1/i }).click();
      await page.getByRole("button", { name: /Gửi Đăng Ký/i }).click();
      await expect(page.getByText(/Nộp Đăng Ký Thành Công/i)).toBeVisible({ timeout: 10000 });

      // Reload & verify "Đổi" button actually switches employee (regression for localStorage draft bug)
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByRole("button", { name: "Đổi" })).toBeVisible();
      await page.getByRole("button", { name: "Đổi" }).click();
      await expect(page.getByPlaceholder(/Gõ tên hoặc mã nhân viên/i)).toBeVisible();

      // Verify deadline enforcement on a past week (Saturday 19:00 passed)
      const pastWeek = "2024-01-01";
      const pastRes = await request.get(
        `${BASE_URL}/api/public/schedule-registration?week=${pastWeek}`,
      );
      expect(pastRes.status()).toBe(200);
      const pastJson = await apiJson<{ isOpen: boolean; isDeadlinePassed: boolean }>(pastRes);
      expect(pastJson.ok).toBe(true);
      expect(pastJson.data?.isOpen).toBe(false);
    } finally {
      await context.close();
    }
  });

  // =========================================================================
  // STAGE 2: Weekly Scheduling (/schedules Desktop & API)
  // =========================================================================
  test("Stage 2: /schedules drawer, Auto-Schedule preview/apply, Copy Previous Week, 2 non-TRUONG_CA staff publish & emergency replace", async ({
    page,
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);
    const ha = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHa.code);
    const huy = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHuy.code);

    // 1. Create a DRAFT week with a 2-person shift and assign 2 non-TRUONG_CA staff (Bảo + Hà)
    const week1 = await findUnusedFutureMonday(request, managerHeaders, 175);
    const sched1 = await createScheduleWeek(request, managerHeaders, week1, false);
    const shift1 = await createShiftInSchedule(request, managerHeaders, sched1.id, {
      workDate: week1,
      name: "Ca 1 (07:00–11:00)",
      startTime: "07:00",
      endTime: "11:00",
      requiredStaff: 2,
      maxStaff: 2,
    });

    expect((await assignEmployeeToShift(request, managerHeaders, shift1.id, bao.id)).status()).toBe(201);
    expect((await assignEmployeeToShift(request, managerHeaders, shift1.id, ha.id)).status()).toBe(201);

    // Publish WITHOUT TRUONG_CA must succeed (200)
    const pubRes = await changeScheduleStatus(request, managerHeaders, sched1.id, "PUBLISH");
    expect(pubRes.status()).toBe(200);

    // Emergency replace Hà with Huy (also non-TRUONG_CA) must succeed (200)
    const replaceRes = await request.post(`${BASE_URL}/api/shifts/${shift1.id}/emergency-replace`, {
      headers: managerHeaders,
      data: {
        absentEmployeeId: ha.id,
        replacementEmployeeId: huy.id,
        reason: "E2E emergency replace without TRUONG_CA",
      },
    });
    expect(replaceRes.status()).toBe(200);

    // 2. Copy Previous Week into week2
    const week2 = await findUnusedFutureMonday(request, managerHeaders, 176);
    const sched2 = await createScheduleWeek(request, managerHeaders, week2, false);
    const copyRes = await request.post(
      `${BASE_URL}/api/schedules/${sched2.id}/copy-previous-week`,
      {
        headers: managerHeaders,
        data: { sourceScheduleId: sched1.id },
      },
    );
    expect([200, 201]).toContain(copyRes.status());

    // 3. Auto-Schedule preview & apply on week3 (from templates)
    const week3 = await findUnusedFutureMonday(request, managerHeaders, 178);
    const sched3 = await createScheduleWeek(request, managerHeaders, week3, true);
    const previewRes = await request.post(
      `${BASE_URL}/api/schedules/${sched3.id}/auto-schedule/preview`,
      {
        headers: managerHeaders,
        data: {},
      },
    );
    expect(previewRes.status()).toBe(200);
    const applyRes = await request.post(
      `${BASE_URL}/api/schedules/${sched3.id}/auto-schedule/apply`,
      {
        headers: managerHeaders,
        data: {},
      },
    );
    expect(applyRes.status()).toBe(200);

    // 4. Desktop UI check on /schedules: page loads and Registration Progress drawer opens
    await loginViaApi(page, "manager");
    await page.goto(`${BASE_URL}/schedules?week=${week1}`, { waitUntil: "networkidle" });
    await expect(page.getByText(/Xếp lịch|Lịch làm việc/i).first()).toBeVisible();

    const progressBtn = page.getByRole("button", { name: /Tiến độ đăng ký/i });
    if (await progressBtn.isVisible().catch(() => false)) {
      await progressBtn.click();
      await expect(page.getByText(/Tiến độ đăng ký ca/i)).toBeVisible({ timeout: 5000 });
    }
  });

  // =========================================================================
  // STAGE 3, 4 & 5: Real Today 2-Person Shift -> QR Kiosk -> ?next= Login ->
  // CLOCK_IN -> Blocked CLOCK_OUT -> Shared 8-step Handover -> Both CLOCK_OUT
  // -> Manager Handover Confirm -> Attendance Approve -> Payroll -> Mobile Payslip
  // =========================================================================
  test("Stages 3-5: Full live day lifecycle (QR Kiosk -> ?next= Login -> 2-staff Clock-In -> Shared Handover unlocks both Clock-Out -> Manager Confirm -> Payroll -> Mobile 375px Payslip)", async ({
    browser,
    request,
  }) => {
    test.setTimeout(60000);
    const managerHeaders = await authHeadersFor(request, "manager");
    const ownerHeaders = await authHeadersFor(request, "owner");

    // Pick 2 non-TRUONG_CA employees (Kiệt & Nhi - PHUC_VU) for today's 2-person shift
    const empA = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeKiet.code);
    const empB = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNhi.code);
    const empAHeaders = await authHeadersFor(request, "employeeKiet");
    const empBHeaders = await authHeadersFor(request, "employeeNhi");

    const { dateStr: todayStr } = getVNClockNow();

    // Ensure current week schedule exists and is editable
    const editableWeek = await ensureEditableWeekForDate(request, ownerHeaders, todayStr);
    const scheduleId = editableWeek.schedule.id;
    const scheduleStatus = editableWeek.schedule.status;

    // Pick a time window today that does not overlap existing assignments for empA & empB
    const existingTodayShifts = (editableWeek.schedule.shifts ?? []).filter(
      (s) => s.workDate.slice(0, 10) === todayStr,
    );
    const busyByEmp = new Map<string, Array<{ start: string; end: string }>>();
    for (const s of existingTodayShifts) {
      const startHm = new Date(s.startAt).toLocaleTimeString("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const endHm = new Date(s.endAt).toLocaleTimeString("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      for (const a of s.assignments ?? []) {
        const list = busyByEmp.get(a.employeeId) ?? [];
        list.push({ start: startHm, end: endHm });
        busyByEmp.set(a.employeeId, list);
      }
    }

    const candidateWindows: Array<{ name: string; startTime: string; endTime: string }> = [
      { name: "Ca 2 (11:00–15:00)", startTime: "11:00", endTime: "15:00" },
      { name: "Ca 3 (15:00–19:00)", startTime: "15:00", endTime: "19:00" },
      { name: "Ca 4 (19:00–23:00)", startTime: "19:00", endTime: "23:00" },
      { name: "Ca 1 (07:00–11:00)", startTime: "07:00", endTime: "11:00" },
    ];
    const overlaps = (a: { start: string; end: string }, b: { startTime: string; endTime: string }) =>
      a.start < b.endTime && b.startTime < a.end;

    const chosenWindow =
      candidateWindows.find(
        (w) =>
          !(busyByEmp.get(empA.id) ?? []).some((b) => overlaps(b, w)) &&
          !(busyByEmp.get(empB.id) ?? []).some((b) => overlaps(b, w)),
      ) ?? { name: "Ca E2E (22:00–23:30)", startTime: "22:00", endTime: "23:30" };

    // Create a clean 2-person shift today
    const shift = await createShiftInSchedule(request, ownerHeaders, scheduleId, {
      workDate: todayStr,
      name: chosenWindow.name,
      startTime: chosenWindow.startTime,
      endTime: chosenWindow.endTime,
      requiredStaff: 2,
      maxStaff: 2,
    });

    // Assign both non-TRUONG_CA staff to this shift
    const assignA = await assignEmployeeToShift(request, ownerHeaders, shift.id, empA.id);
    const assignB = await assignEmployeeToShift(request, ownerHeaders, shift.id, empB.id);
    expect([200, 201], `assignA failed: ${await assignA.text()}`).toContain(assignA.status());
    expect([200, 201], `assignB failed: ${await assignB.text()}`).toContain(assignB.status());

    if (scheduleStatus === "DRAFT") {
      const pub = await changeScheduleStatus(request, ownerHeaders, scheduleId, "PUBLISH");
      expect(pub.status()).toBe(200);
    }

    // Helper to get fresh Kiosk token via API
    async function getFreshKioskToken(): Promise<string> {
      const res = await request.post(`${BASE_URL}/api/attendance/kiosk/token`, {
        headers: managerHeaders,
        data: { baseUrl: BASE_URL },
      });
      expect(res.status()).toBe(200);
      const json = await apiJson<{ token: string }>(res);
      expect(json.data?.token).toBeTruthy();
      return json.data!.token;
    }

    // -----------------------------------------------------------------------
    // 3A. Manager verifies /attendance/kiosk renders live QR code
    // -----------------------------------------------------------------------
    const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const managerPage = await desktopCtx.newPage();
    try {
      await loginViaApi(managerPage, "manager");
      await managerPage.goto(`${BASE_URL}/attendance/kiosk`, { waitUntil: "networkidle" });
      await expect(managerPage.getByText(/Kiosk Chấm công/i)).toBeVisible();
      await expect(managerPage.getByAltText("QR Chấm công")).toBeVisible();
    } finally {
      await desktopCtx.close();
    }

    // -----------------------------------------------------------------------
    // 3B. Unauthenticated Employee A scans QR URL -> /login?next=... -> lands on /employee/attendance?token=...
    // -----------------------------------------------------------------------
    const mobileCtxA = await browser.newContext({ viewport: MOBILE_VIEWPORTS.sm375 });
    const pageA = await mobileCtxA.newPage();

    let handoverId: string | null = null;
    try {
      const token1 = await getFreshKioskToken();
      await clearSession(pageA);
      await pageA.goto(`${BASE_URL}/employee/attendance?token=${token1}`, {
        waitUntil: "networkidle",
      });

      // Must redirect to /login with next=/employee/attendance?token=...
      expect(pageA.url()).toContain("/login");
      const loginUrl = new URL(pageA.url());
      const nextParam = loginUrl.searchParams.get("next") || loginUrl.searchParams.get("from");
      expect(nextParam).toBe(`/employee/attendance?token=${token1}`);

      // Login via UI form and verify redirect back to /employee/attendance?token=...
      await pageA.locator("#email").fill(SEEDED_USERS.employeeKiet.email);
      await pageA.locator("#password").fill(SEEDED_USERS.employeeKiet.password);
      await pageA.getByRole("button", { name: "Đăng nhập" }).click();

      await pageA.waitForURL((url) => url.pathname === "/employee/attendance", { timeout: 15000 });
      expect(pageA.url()).toContain(`token=${token1}`);

      // Check if Employee A already clocked in today from an earlier run; if not, test UI CLOCK_IN
      const todayStatusResA = await request.get(`${BASE_URL}/api/attendance/my?today=true`, {
        headers: empAHeaders,
      });
      const todayStatusA = await apiJson<{
        currentStatus: { hasClockedIn: boolean; hasClockedOut: boolean };
      }>(todayStatusResA);

      if (!todayStatusA.data?.currentStatus?.hasClockedIn) {
        // 1-tap confirm banner for CLOCK_IN
        await expect(pageA.getByText(/Đã nhận mã QR từ Kiosk/i)).toBeVisible();
        const scanRespPromise = pageA.waitForResponse(
          (r) => r.url().includes("/api/attendance/scan") && r.request().method() === "POST",
        );
        const refreshRespPromise = pageA.waitForResponse(
          (r) => r.url().includes("/api/attendance/my?today=true"),
        );
        await pageA.getByRole("button", { name: /Bấm để ghi nhận \[Vào ca\] ngay/i }).click();
        const scanResp = await scanRespPromise;
        expect([200, 201]).toContain(scanResp.status());
        await refreshRespPromise;
      }

      // Now try CLOCK_OUT with a fresh token BEFORE submitting handover -> must be BLOCKED with 1-tap button to /employee/handover
      const tokenClockOutBlocked = await getFreshKioskToken();
      await pageA.locator("#manual-token").fill(tokenClockOutBlocked);
      const confirmBtn = pageA.getByRole("button", { name: "Xác nhận" });
      await expect(confirmBtn).toBeEnabled({ timeout: 5000 });
      await confirmBtn.click();

      const errorAlert = pageA.getByTestId("attendance-error-alert");
      await expect(errorAlert).toBeVisible({ timeout: 10000 });
      await expect(errorAlert).toContainText(/bàn giao/i);
      const goToHandoverBtn = pageA.getByTestId("go-to-handover-from-error");
      await expect(goToHandoverBtn).toBeVisible();

      // Employee B also clocks in on the same 2-person shift
      const todayStatusResB = await request.get(`${BASE_URL}/api/attendance/my?today=true`, {
        headers: empBHeaders,
      });
      const todayStatusB = await apiJson<{
        currentStatus: { hasClockedIn: boolean; hasClockedOut: boolean };
      }>(todayStatusResB);
      if (!todayStatusB.data?.currentStatus?.hasClockedIn) {
        const tokenBIn = await getFreshKioskToken();
        const scanBIn = await request.post(`${BASE_URL}/api/attendance/scan`, {
          headers: empBHeaders,
          data: { token: tokenBIn, eventType: "CLOCK_IN" },
        });
        expect([200, 201]).toContain(scanBIn.status());
      }

      // Verify Employee B is ALSO blocked from CLOCK_OUT before handover
      const tokenBOutBlocked = await getFreshKioskToken();
      const scanBOutBlocked = await request.post(`${BASE_URL}/api/attendance/scan`, {
        headers: empBHeaders,
        data: { token: tokenBOutBlocked, eventType: "CLOCK_OUT" },
      });
      expect(scanBOutBlocked.status()).toBe(400);

      // ---------------------------------------------------------------------
      // STAGE 4: Employee A clicks 1-tap button to /employee/handover & submits 8-step handover
      // ---------------------------------------------------------------------
      await goToHandoverBtn.click();
      await pageA.waitForURL((url) => url.pathname === "/employee/handover", { timeout: 10000 });
      await expect(pageA.getByRole("heading", { name: /Biên bản Bàn giao ca/i })).toBeVisible();
      await assertNoHorizontalOverflow(pageA, "/employee/handover mobile 375px");

      // Submit shared handover for this shift via API as Employee A (simulating wizard completion)
      // First verify wizard steps render on mobile
      await expect(pageA.getByText(/Bước 1\/8/i)).toBeVisible();

      const submitHandoverRes = await request.post(`${BASE_URL}/api/handovers`, {
        headers: empAHeaders,
        data: {
          shiftId: shift.id,
          handoverEmployeeId: empA.id,
          receivingEmployeeId: empB.id,
          reconciliation: {
            openingCashVnd: 2000000,
            cashSalesVnd: 500000,
            cashExpensesVnd: 100000,
            actualClosingCashVnd: 2400000,
          },
          inventory: [
            { item: "Cà phê hạt Blend D'Lat", currentQty: 8, unit: "kg", condition: "ENOUGH" },
          ],
          equipment: [
            { name: "Máy pha La Marzocco", status: "GOOD", note: "Ổn định" },
          ],
          cleanliness: [
            { area: "[1] Quầy pha chế sạch sẽ", isDone: true },
          ],
          customerNotes: "Khách ổn định",
          pendingTasks: [],
          handoverNotes: "E2E shared handover by Employee A",
        },
      });
      expect(submitHandoverRes.status()).toBe(201);
      const handoverJson = await apiJson<{ id?: string; handover?: { id: string } }>(
        submitHandoverRes,
      );
      handoverId = handoverJson.data?.handover?.id ?? handoverJson.data?.id ?? null;
      expect(handoverId).toBeTruthy();

      // Employee B visits /employee/handover on mobile -> sees shared handover already submitted banner!
      const mobileCtxB = await browser.newContext({ viewport: MOBILE_VIEWPORTS.sm375 });
      const pageB = await mobileCtxB.newPage();
      try {
        await loginViaApi(pageB, "employeeNhi");
        await pageB.goto(`${BASE_URL}/employee/handover`, { waitUntil: "networkidle" });
        await expect(pageB.getByTestId("shared-handover-submitted-banner")).toBeVisible();
        await expect(pageB.getByTestId("shared-handover-submitted-banner")).toContainText(
          SEEDED_USERS.employeeKiet.fullName,
        );
      } finally {
        await mobileCtxB.close();
      }

      // BOTH Employee A and Employee B are now UNLOCKED for CLOCK_OUT!
      const tokenAOut = await getFreshKioskToken();
      const scanAOut = await request.post(`${BASE_URL}/api/attendance/scan`, {
        headers: empAHeaders,
        data: { token: tokenAOut, eventType: "CLOCK_OUT" },
      });
      expect([200, 201]).toContain(scanAOut.status());

      const tokenBOut = await getFreshKioskToken();
      const scanBOut = await request.post(`${BASE_URL}/api/attendance/scan`, {
        headers: empBHeaders,
        data: { token: tokenBOut, eventType: "CLOCK_OUT" },
      });
      expect([200, 201]).toContain(scanBOut.status());
    } finally {
      await mobileCtxA.close();
    }

    // Manager confirms handover on /handovers
    expect(handoverId).toBeTruthy();
    const confirmRes = await request.post(`${BASE_URL}/api/handovers/${handoverId}/confirm`, {
      headers: managerHeaders,
      data: { action: "CONFIRM", note: "E2E Manager confirmed shared handover" },
    });
    expect(confirmRes.status()).toBe(200);

    // -----------------------------------------------------------------------
    // STAGE 5: Attendance Approval -> Payroll Period -> Mobile /employee/payroll Payslip Modal
    // -----------------------------------------------------------------------
    const attListRes = await request.get(`${BASE_URL}/api/attendance?workDate=${todayStr}`, {
      headers: managerHeaders,
    });
    expect(attListRes.status()).toBe(200);
    const attListJson = await apiJson<Array<{ id: string; employeeId: string; status: string }>>(
      attListRes,
    );
    const targetAttendances = (attListJson.data ?? []).filter(
      (a) => (a.employeeId === empA.id || a.employeeId === empB.id) && a.status === "PENDING",
    );

    for (const att of targetAttendances) {
      const approveRes = await request.patch(`${BASE_URL}/api/attendance/${att.id}/approve`, {
        headers: managerHeaders,
        data: {},
      });
      expect([200, 201]).toContain(approveRes.status());
    }

    // Check /payroll on Desktop and /employee/payroll on Mobile 375x812
    const desktopPayrollCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const payrollPage = await desktopPayrollCtx.newPage();
    try {
      await loginViaApi(payrollPage, "owner");
      await payrollPage.goto(`${BASE_URL}/payroll`, { waitUntil: "networkidle" });
      await expect(payrollPage.getByText(/Bảng lương|Kỳ lương/i).first()).toBeVisible();
    } finally {
      await desktopPayrollCtx.close();
    }

    const mobilePayrollCtx = await browser.newContext({ viewport: MOBILE_VIEWPORTS.sm375 });
    const empPayrollPage = await mobilePayrollCtx.newPage();
    try {
      await loginViaApi(empPayrollPage, "employeeNam");
      await empPayrollPage.goto(`${BASE_URL}/employee/payroll`, { waitUntil: "networkidle" });
      await expect(empPayrollPage.getByRole("heading", { name: /Phiếu lương của Tôi/i })).toBeVisible();
      await assertNoHorizontalOverflow(empPayrollPage, "/employee/payroll mobile 375px");

      // Open payslip modal if at least 1 payslip exists
      const viewSlipBtn = empPayrollPage.getByRole("button", { name: /Xem phiếu lương|Chi tiết/i }).first();
      if (await viewSlipBtn.isVisible().catch(() => false)) {
        await viewSlipBtn.click();
        await expect(empPayrollPage.getByRole("dialog")).toBeVisible({ timeout: 5000 });
        await expect(
          empPayrollPage.getByRole("dialog").getByText(/Phiếu Lương/i).first(),
        ).toBeVisible();
      }
    } finally {
      await mobilePayrollCtx.close();
    }
  });
});
