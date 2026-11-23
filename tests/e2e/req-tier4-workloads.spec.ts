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
  computeReminderShiftWindow,
  createScheduleWeek,
  createShiftInSchedule,
  deleteShiftSafe,
  ensureEditableWeekForDate,
  findEmployeeByCode,
  findUnusedFutureMonday,
  getNotifications,
  loginViaApi,
  markAllNotificationsRead,
  pickEmployeeWithoutApprovedLeave,
  restoreSettings,
  snapshotSettings,
  updateEmployeeContacts,
  updateNotificationPolicy,
  waitForServiceWorkerReady,
  type LeaveRequestDto,
  type ShiftHandoverDto,
} from "./helpers/req-e2e-helpers";

test.describe("Tier 4 — Real-World D'Lat Cafe 4-Shift Operational Workloads (5 tests)", () => {
  test("T4-01: Sat 19:00 Weekly Schedule Publish Cycle across 4 shifts (CA_1-CA_4) and mobile NotificationBell verification", async ({
    page,
    request,
  }) => {
    const ownerHeaders = await authHeadersFor(request, "owner");
    const namHeaders = await authHeadersFor(request, "employeeNam");
    const baoHeaders = await authHeadersFor(request, "employeeBao");
    const nam = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeNam.code);
    const bao = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeBao.code);

    const settingsSnapshot = await snapshotSettings(request, ownerHeaders);
    const namOriginal = {
      telegramChatId: nam.telegramChatId ?? null,
      zaloUserId: nam.zaloUserId ?? null,
      notificationPreferences: nam.notificationPreferences ?? { telegram: true, zalo: true, email: true },
    };

    try {
      await updateNotificationPolicy(request, ownerHeaders, {
        enableTelegram: true,
        enableZalo: true,
        enableEmail: true,
        shiftStartReminderMinutes: 15,
        shiftEndReminderMinutes: 15,
      });
      await updateEmployeeContacts(request, ownerHeaders, nam.id, {
        telegramChatId: "4001001",
        zaloUserId: "zalo_t4_nam",
        notificationPreferences: { telegram: true, zalo: true, email: true },
      });

      const weekStart = await findUnusedFutureMonday(request, ownerHeaders, 210);
      const sched = await createScheduleWeek(request, ownerHeaders, weekStart, true);
      expect(sched.shifts.length).toBeGreaterThanOrEqual(28); // 7 days * 4 shifts (CA_1-CA_4)

      const firstDayCa1 = sched.shifts.find((s) => s.workDate === weekStart && s.startTime === "07:00");
      expect(firstDayCa1).toBeDefined();
      if (firstDayCa1) {
        expect((await assignEmployeeToShift(request, ownerHeaders, firstDayCa1.id, nam.id)).status()).toBe(201);
        expect((await assignEmployeeToShift(request, ownerHeaders, firstDayCa1.id, bao.id)).status()).toBe(201);
      }

      await markAllNotificationsRead(request, namHeaders);
      await markAllNotificationsRead(request, baoHeaders);

      await loginViaApi(page, "owner");
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto(`${BASE_URL}/schedules?week=${weekStart}`);
      await page.waitForLoadState("networkidle");

      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: /Công bố lịch/i }).click();
      await expect(page.getByText(/Đã công bố/i).first()).toBeVisible({ timeout: 10000 });

      expect((await getNotifications(request, namHeaders, true)).items.some((n) => n.type === "SCHEDULE_PUBLISHED")).toBe(
        true,
      );
      expect((await getNotifications(request, baoHeaders, true)).items.some((n) => n.type === "SCHEDULE_PUBLISHED")).toBe(
        true,
      );

      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page, "T4-01 employee mobile profile");

      await page.locator('button[title="Thông báo"]').click();
      const link = page.locator(`a[href="/employee/schedule?week=${weekStart}"]`).first();
      await expect(link).toBeVisible({ timeout: 10000 });
      await link.click();
      await page.waitForURL(`**/employee/schedule?week=${weekStart}`, { timeout: 10000 });
      await assertNoHorizontalOverflow(page, "T4-01 employee schedule mobile");
    } finally {
      await restoreSettings(request, ownerHeaders, settingsSnapshot);
      await updateEmployeeContacts(request, ownerHeaders, nam.id, namOriginal);
    }
  });

  test("T4-02: Sudden Emergency Leave (<2h), Auto-Unassign, Emergency Replace & Cron Exclusion", async ({ request }) => {
    const ownerHeaders = await authHeadersFor(request, "owner");
    const managerHeaders = await authHeadersFor(request, "manager");
    const haHeaders = await authHeadersFor(request, "employeeHa");
    const ha = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeHa.code);
    const win = computeReminderShiftWindow("start", 10, 90);
    const { userKey: absentKey, employee: absentEmp } = await pickEmployeeWithoutApprovedLeave(
      request,
      ownerHeaders,
      ["employeeBao", "employeeQuan", "employeeHuy"],
      win.startAtIso,
      win.endAtIso,
    );
    const absentHeaders = await authHeadersFor(request, absentKey);
    const shiftTitle = `T4-02 Ca2 Emergency ${Date.now()}`;
    let createdShiftId: string | null = null;

    try {
      const { schedule } = await ensureEditableWeekForDate(request, ownerHeaders, win.workDate);
      const shift = await createShiftInSchedule(request, ownerHeaders, schedule.id, {
        workDate: win.workDate,
        name: shiftTitle,
        startTime: win.startTime,
        endTime: win.endTime,
        maxStaff: 2,
      });
      createdShiftId = shift.id;
      expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, absentEmp.id)).status()).toBe(201);
      if (schedule.status === "DRAFT") {
        expect((await changeScheduleStatus(request, ownerHeaders, schedule.id, "PUBLISH")).status()).toBe(200);
      }

      await markAllNotificationsRead(request, managerHeaders);
      const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
        headers: absentHeaders,
        data: {
          shiftId: shift.id,
          startAt: win.startAtIso,
          endAt: win.endAtIso,
          isEmergency: true,
          reason: "T4-02 nhân viên nghỉ đột xuất trước giờ ca",
        },
      });
      expect(leaveRes.status()).toBe(201);
      const leaveId = (await apiJson<LeaveRequestDto>(leaveRes)).data?.id ?? "";
      expect((await getNotifications(request, managerHeaders, true)).items.some((n) => n.type === "LEAVE_SUBMITTED")).toBe(
        true,
      );

      // Manager approves leave -> absentEmp unassigned, then assigns standby Ha onto vacated shift
      await markAllNotificationsRead(request, absentHeaders);
      expect(
        (
          await request.post(`${BASE_URL}/api/leaves/${leaveId}/review`, {
            headers: managerHeaders,
            data: { status: "APPROVED", reviewNote: "Duyệt nghỉ khẩn cấp" },
          })
        ).status(),
      ).toBe(200);
      expect((await getNotifications(request, absentHeaders, true)).items.some((n) => n.type === "LEAVE_REVIEWED")).toBe(
        true,
      );

      // Re-assign standby Ha onto the vacated shift
      await markAllNotificationsRead(request, haHeaders);
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, ha.id)).status()).toBe(201);
      expect((await getNotifications(request, haHeaders, true)).items.some((n) => n.type === "SCHEDULE_UPDATED")).toBe(
        true,
      );

      // Cron runs -> skips absent staff, reminds replacement Ha
      await markAllNotificationsRead(request, absentHeaders);
      await markAllNotificationsRead(request, haHeaders);
      expect((await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: managerHeaders })).status()).toBe(
        200,
      );
      expect(
        (await getNotifications(request, absentHeaders, true)).items.some(
          (n) => n.type === "SHIFT_REMINDER" && n.message.includes(shiftTitle),
        ),
      ).toBe(false);
      expect(
        (await getNotifications(request, haHeaders, true)).items.some((n) => n.type === "SHIFT_REMINDER"),
      ).toBe(true);
    } finally {
      await deleteShiftSafe(request, ownerHeaders, createdShiftId);
    }
  });

  test("T4-03: 8-Step Mobile Shift Handover with -50,000đ Cash Shortage, Manager Notification & Confirm/Reopen", async ({
    page,
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    await markAllNotificationsRead(request, managerHeaders);

    await page.setViewportSize(MOBILE_VIEWPORTS.md390);
    await loginViaApi(page, "employeeNam");
    await page.goto(`${BASE_URL}/employee/handover`);
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalOverflow(page, "T4-03 Step 1 @ 390x844");

    await page.getByRole("button", { name: /Tiếp theo/i }).click();
    await page.locator('input[type="number"]').nth(0).fill("2000000");
    await page.locator('input[type="number"]').nth(1).fill("1500000");
    await page.locator('input[type="number"]').nth(2).fill("100000");
    await page.locator('input[type="number"]').nth(3).fill("3350000");
    await page.locator('input[placeholder*="Khách thối nhầm"]').fill("T4-03 thiếu 50.000đ cuối ca cần quản lý đối soát");

    for (let s = 2; s < 5; s += 1) {
      await page.getByRole("button", { name: /Tiếp theo/i }).click();
    }
    const quickTick = page.getByRole("button", { name: /Tick nhanh việc hôm nay/i });
    if (await quickTick.isVisible()) {
      await quickTick.click();
    }
    for (let s = 5; s < 8; s += 1) {
      await page.getByRole("button", { name: /Tiếp theo/i }).click();
    }
    await assertNoHorizontalOverflow(page, "T4-03 Step 8 @ 390x844");

    let handoverId = "";
    try {
      const postPromise = page.waitForResponse(
        (r) => r.url().includes("/api/handovers") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: /Nộp bàn giao/i }).click();
      const postRes = await postPromise;
      expect(postRes.status()).toBe(201);
      const handoverJson = await apiJson<{ handover?: ShiftHandoverDto }>(postRes);
      handoverId = handoverJson.data?.handover?.id ?? "";
      expect(handoverId).toBeTruthy();
      expect(handoverJson.data?.handover?.status).toBe("DISCREPANCY");

      const mgrNotifs = await getNotifications(request, managerHeaders, true);
      expect(mgrNotifs.items.some((n) => n.linkUrl === "/handovers")).toBe(true);

      // Manager views /handovers, confirms and reopens so today's fallback shift remains editable for future runs
      await loginViaApi(page, "manager");
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${BASE_URL}/handovers`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/Có sai lệch|Lệch két/i).first()).toBeVisible({ timeout: 10000 });
    } finally {
      if (handoverId) {
        expect(
          (await request.post(`${BASE_URL}/api/handovers/${handoverId}/confirm`, { headers: managerHeaders })).status(),
        ).toBe(200);
        expect(
          (
            await request.post(`${BASE_URL}/api/handovers/${handoverId}/reopen`, {
              headers: managerHeaders,
              data: { reopenReason: "T4-03 mở lại sau đối soát" },
            })
          ).status(),
        ).toBe(200);
      }
    }
  });

  test("T4-04: 4-Shift Start/End Reminders & Idempotent Cron in Asia/Ho_Chi_Minh", async ({ request }) => {
    const ownerHeaders = await authHeadersFor(request, "owner");
    const namHeaders = await authHeadersFor(request, "employeeNam");
    const anhHeaders = await authHeadersFor(request, "employeeAnh");
    const linhHeaders = await authHeadersFor(request, "employeeLinh");
    const nam = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeNam.code);
    const anh = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeAnh.code);
    const linh = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeLinh.code);

    const snapshot = await snapshotSettings(request, ownerHeaders);
    const startWin = computeReminderShiftWindow("start", 8, 90);
    const endWin = computeReminderShiftWindow("end", 8, 90);
    let startShiftId: string | null = null;
    let endShiftId: string | null = null;
    let removedShiftId: string | null = null;

    try {
      await updateNotificationPolicy(request, ownerHeaders, {
        shiftStartReminderMinutes: 15,
        shiftEndReminderMinutes: 15,
      });

      const { schedule: startSched } = await ensureEditableWeekForDate(request, ownerHeaders, startWin.workDate);
      const { schedule: endSched } =
        endWin.workDate === startWin.workDate
          ? { schedule: startSched }
          : await ensureEditableWeekForDate(request, ownerHeaders, endWin.workDate);

      const startShift = await createShiftInSchedule(request, ownerHeaders, startSched.id, {
        workDate: startWin.workDate,
        name: `T4-04 StartWindow ${Date.now()}`,
        startTime: startWin.startTime,
        endTime: startWin.endTime,
      });
      startShiftId = startShift.id;

      const endShift = await createShiftInSchedule(request, ownerHeaders, endSched.id, {
        workDate: endWin.workDate,
        name: `T4-04 EndWindow ${Date.now()}`,
        startTime: endWin.startTime,
        endTime: endWin.endTime,
      });
      endShiftId = endShift.id;

      const removedShift = await createShiftInSchedule(request, ownerHeaders, startSched.id, {
        workDate: startWin.workDate,
        name: `T4-04 Removed ${Date.now()}`,
        startTime: startWin.startTime,
        endTime: startWin.endTime,
      });
      removedShiftId = removedShift.id;

      expect((await assignEmployeeToShift(request, ownerHeaders, startShift.id, nam.id)).status()).toBe(201);
      expect((await assignEmployeeToShift(request, ownerHeaders, endShift.id, anh.id)).status()).toBe(201);
      const remAssign = await assignEmployeeToShift(request, ownerHeaders, removedShift.id, linh.id);
      expect(remAssign.status()).toBe(201);
      const remJson = await apiJson<{ id?: string; assignment?: { id: string } }>(remAssign);
      const remId = remJson.data?.assignment?.id ?? remJson.data?.id ?? "";
      expect(remId).toBeTruthy();
      expect((await request.delete(`${BASE_URL}/api/assignments/${remId}`, { headers: ownerHeaders })).status()).toBe(
        200,
      );

      if (startSched.status === "DRAFT") {
        expect((await changeScheduleStatus(request, ownerHeaders, startSched.id, "PUBLISH")).status()).toBe(200);
      }
      if (endSched.id !== startSched.id && endSched.status === "DRAFT") {
        expect((await changeScheduleStatus(request, ownerHeaders, endSched.id, "PUBLISH")).status()).toBe(200);
      }

      await markAllNotificationsRead(request, namHeaders);
      await markAllNotificationsRead(request, anhHeaders);
      await markAllNotificationsRead(request, linhHeaders);

      expect((await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders })).status()).toBe(200);
      const namAfter1 = (await getNotifications(request, namHeaders, true)).items.filter(
        (n) => n.type === "SHIFT_REMINDER",
      ).length;
      const anhAfter1 = (await getNotifications(request, anhHeaders, true)).items.filter(
        (n) => n.type === "SHIFT_REMINDER",
      ).length;
      expect(namAfter1).toBeGreaterThanOrEqual(1);
      expect(anhAfter1).toBeGreaterThanOrEqual(1);
      expect(
        (await getNotifications(request, linhHeaders, true)).items.some(
          (n) => n.type === "SHIFT_REMINDER" && n.message.includes("T4-04 Removed"),
        ),
      ).toBe(false);

      // Second consecutive run must be idempotent
      expect((await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders })).status()).toBe(200);
      const namAfter2 = (await getNotifications(request, namHeaders, true)).items.filter(
        (n) => n.type === "SHIFT_REMINDER",
      ).length;
      const anhAfter2 = (await getNotifications(request, anhHeaders, true)).items.filter(
        (n) => n.type === "SHIFT_REMINDER",
      ).length;
      expect(namAfter2).toBe(namAfter1);
      expect(anhAfter2).toBe(anhAfter1);
    } finally {
      await deleteShiftSafe(request, ownerHeaders, startShiftId);
      await deleteShiftSafe(request, ownerHeaders, endShiftId);
      await deleteShiftSafe(request, ownerHeaders, removedShiftId);
      await restoreSettings(request, ownerHeaders, snapshot);
    }
  });

  test("T4-05: Mobile Network Outage Recovery — Draft Preservation, /offline Fallback & Online Resubmit", async ({
    page,
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    await markAllNotificationsRead(request, managerHeaders);

    await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
    await loginViaApi(page, "employeeNam");
    await page.goto(`${BASE_URL}/employee/handover`);
    await page.waitForLoadState("networkidle");
    await waitForServiceWorkerReady(page);

    // Complete wizard with discrepancy
    await page.getByRole("button", { name: /Tiếp theo/i }).click();
    await page.locator('input[type="number"]').nth(0).fill("1500000");
    await page.locator('input[type="number"]').nth(1).fill("500000");
    await page.locator('input[type="number"]').nth(2).fill("100000");
    await page.locator('input[type="number"]').nth(3).fill("1865000");
    await page.locator('input[placeholder*="Khách thối nhầm"]').fill("T4-05 mất mạng khi nộp biên bản thiếu 35k");

    for (let s = 2; s < 5; s += 1) {
      await page.getByRole("button", { name: /Tiếp theo/i }).click();
    }
    const quickTick = page.getByRole("button", { name: /Tick nhanh việc hôm nay/i });
    if (await quickTick.isVisible()) {
      await quickTick.click();
    }
    for (let s = 5; s < 8; s += 1) {
      await page.getByRole("button", { name: /Tiếp theo/i }).click();
    }

    try {
      await page.context().setOffline(true);
      await page.getByRole("button", { name: /Nộp bàn giao/i }).click();
      await expect(page.locator("[role='alert'], .text-red-700, .text-red-800").first()).toBeVisible({
        timeout: 10000,
      });

      const draftKeys = await page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.startsWith("dlat_handover_draft_")),
      );
      expect(draftKeys.length).toBeGreaterThan(0);

      // Navigating while offline triggers /offline fallback cleanly
      await clearSession(page);
      await page.goto(`${BASE_URL}/register-schedule`, { waitUntil: "domcontentloaded" });
      expect(page.url()).not.toContain("chrome-error://");
      await expect(page.locator("h1, h2").first()).toBeVisible();
    } finally {
      await page.context().setOffline(false);
    }

    // Re-authenticate, return to /employee/handover, verify draft survived and resubmit
    await loginViaApi(page, "employeeNam");
    await page.goto(`${BASE_URL}/employee/handover`);
    await page.waitForLoadState("networkidle");

    const submitBtn = page.getByRole("button", { name: /Nộp bàn giao/i });
    const nextBtn = page.getByRole("button", { name: /Tiếp theo/i });
    for (let guard = 0; guard < 8 && !(await submitBtn.isVisible()); guard += 1) {
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
      } else {
        break;
      }
    }
    await expect(submitBtn).toBeVisible({ timeout: 10000 });

    const postPromise = page.waitForResponse(
      (r) => r.url().includes("/api/handovers") && r.request().method() === "POST",
    );
    await submitBtn.click();
    const postRes = await postPromise;
    expect(postRes.status()).toBe(201);

    const mgrNotifs = await getNotifications(request, managerHeaders, true);
    expect(mgrNotifs.items.some((n) => n.linkUrl === "/handovers")).toBe(true);
  });
});
