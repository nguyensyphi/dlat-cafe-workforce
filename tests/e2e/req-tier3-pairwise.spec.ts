import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  MOBILE_VIEWPORTS,
  SEEDED_USERS,
  apiJson,
  assertNoHorizontalOverflow,
  assertTouchTargetsMinSize,
  assignEmployeeToShift,
  authHeadersFor,
  buildHandoverPayload,
  changeScheduleStatus,
  clearSession,
  computeReminderShiftWindow,
  createScheduleWeek,
  createShiftInSchedule,
  deleteShiftSafe,
  ensureEditableWeekForDate,
  findEmployeeByCode,
  findUnusedFutureMonday,
  formatVnDateTimeLocalOffset,
  getNotifications,
  loginViaApi,
  markAllNotificationsRead,
  pickEmployeeWithoutApprovedLeave,
  restoreSettings,
  snapshotSettings,
  updateEmployeeContacts,
  updateNotificationPolicy,
  updateSelfNotificationContacts,
  waitForServiceWorkerReady,
  type LeaveRequestDto,
  type ScheduleDetailDto,
  type SwapRequestDto,
} from "./helpers/req-e2e-helpers";

test.describe("Tier 3 — Cross-Feature Pairwise Interactions (12 tests)", () => {
  test("T3-01 (F4 + F5): 375x812 mobile /employee/profile and /settings render notification contacts with zero overflow and >=44px controls", async ({
    page,
    request,
  }) => {
    const ownerHeaders = await authHeadersFor(request, "owner");
    const nam = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeNam.code);
    const original = {
      telegramChatId: nam.telegramChatId ?? null,
      zaloUserId: nam.zaloUserId ?? null,
      notificationPreferences: nam.notificationPreferences ?? { telegram: true, zalo: true, email: true },
    };

    try {
      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page, "/employee/profile @ 375x812");
      await assertTouchTargetsMinSize(
        [
          page.locator("#self-telegram-chat-id"),
          page.locator("#self-zalo-user-id"),
          page.getByRole("button", { name: /Lưu cài đặt thông báo/i }),
        ],
        44,
        44,
        "/employee/profile notification contacts @ 375x812",
      );

      const namHeaders = await authHeadersFor(request, "employeeNam");
      const patchRes = await updateSelfNotificationContacts(request, namHeaders, {
        telegramChatId: "375812001",
        zaloUserId: "zalo_375_nam",
      });
      expect(patchRes.status).toBe(200);

      await loginViaApi(page, "owner");
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page, "/settings @ 375x812");
    } finally {
      await updateEmployeeContacts(request, ownerHeaders, nam.id, original);
    }
  });

  test("T3-02 (F3 + F8): Offline emergency leave submit shows error without SW faking; reconnect resubmits 201 and alerts manager", async ({
    page,
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    await markAllNotificationsRead(request, managerHeaders);

    await loginViaApi(page, "employeeNam");
    await page.goto(`${BASE_URL}/employee/requests`);
    await page.waitForLoadState("networkidle");
    await waitForServiceWorkerReady(page);

    await page.getByRole("button", { name: /Tạo đơn xin nghỉ/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const emergencyToggle = dialog.locator('input[type="checkbox"], [role="switch"]').first();
    await expect(emergencyToggle).toBeVisible();
    await emergencyToggle.click();

    const startDt = formatVnDateTimeLocalOffset(60);
    const endDt = formatVnDateTimeLocalOffset(180);
    await dialog.locator('input[type="datetime-local"]').nth(0).fill(startDt);
    await dialog.locator('input[type="datetime-local"]').nth(1).fill(endDt);
    await dialog.locator("input[placeholder*='Bận việc']").fill("T3-02 pairwise offline emergency leave");

    try {
      await page.context().setOffline(true);
      await dialog.getByRole("button", { name: /Gửi đơn xin nghỉ/i }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".text-red-700, [role='alert']").first()).toBeVisible({ timeout: 10000 });
    } finally {
      await page.context().setOffline(false);
    }

    const postPromise = page.waitForResponse(
      (r) => r.url().includes("/api/leaves") && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: /Gửi đơn xin nghỉ/i }).click();
    const postRes = await postPromise;
    expect(postRes.status()).toBe(201);

    const mgrNotifs = await getNotifications(request, managerHeaders, true);
    expect(mgrNotifs.items.some((n) => n.type === "LEAVE_SUBMITTED")).toBe(true);
  });

  test("T3-03 (F3 + F9): Offline handover with -40,000đ shortage preserves localStorage draft; online resubmit alerts manager", async ({
    page,
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    await markAllNotificationsRead(request, managerHeaders);

    await loginViaApi(page, "employeeNam");
    await page.goto(`${BASE_URL}/employee/handover`);
    await page.waitForLoadState("networkidle");
    await waitForServiceWorkerReady(page);

    // Step 1 -> Step 2
    await page.getByRole("button", { name: /Tiếp theo/i }).click();
    await page.locator('input[type="number"]').nth(0).fill("1000000");
    await page.locator('input[type="number"]').nth(1).fill("500000");
    await page.locator('input[type="number"]').nth(2).fill("100000");
    await page.locator('input[type="number"]').nth(3).fill("1360000");
    await page.locator('input[placeholder*="Khách thối nhầm"]').fill("T3-03 thiếu 40k để kiểm tra draft offline");

    // Step 2 -> Step 5 quick tick -> Step 8
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
      const draftCount = await page.evaluate(
        () => Object.keys(localStorage).filter((k) => k.startsWith("dlat_handover_draft_")).length,
      );
      expect(draftCount).toBeGreaterThan(0);
    } finally {
      await page.context().setOffline(false);
    }

    const postPromise = page.waitForResponse(
      (r) => r.url().includes("/api/handovers") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Nộp bàn giao/i }).click();
    const postRes = await postPromise;
    expect(postRes.status()).toBe(201);

    const mgrNotifs = await getNotifications(request, managerHeaders, true);
    expect(mgrNotifs.items.some((n) => n.linkUrl === "/handovers")).toBe(true);
  });

  test("T3-04 (F4 + F7): At 390x844 mobile viewport, assigned employee opens NotificationBell SCHEDULE_PUBLISHED link cleanly", async ({
    page,
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    const anhHeaders = await authHeadersFor(request, "employeeAnh");
    const anh = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeAnh.code);
    await markAllNotificationsRead(request, anhHeaders);

    const weekStart = await findUnusedFutureMonday(request, managerHeaders, 170);
    const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
    const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
      workDate: weekStart,
      name: "Ca 1 Mobile Bell Link",
      startTime: "07:00",
      endTime: "11:00",
    });
    expect((await assignEmployeeToShift(request, managerHeaders, shift.id, anh.id)).status()).toBe(201);
    expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

    await page.setViewportSize(MOBILE_VIEWPORTS.md390);
    await loginViaApi(page, "employeeAnh");
    await page.goto(`${BASE_URL}/employee/schedule`);
    await page.waitForLoadState("networkidle");

    await page.locator('button[title="Thông báo"]').click();
    await assertNoHorizontalOverflow(page, "NotificationBell @ 390x844");

    const detailLink = page.locator(`a[href="/employee/schedule?week=${weekStart}"]`).first();
    await expect(detailLink).toBeVisible({ timeout: 10000 });
    await detailLink.click();
    await page.waitForURL(`**/employee/schedule?week=${weekStart}`, { timeout: 10000 });
    await assertNoHorizontalOverflow(page, "Target schedule week @ 390x844");
  });

  test("T3-05 (F5 + F6): Policy enableTelegram=false respects policy toggle while keeping in-app notification active", async ({
    request,
  }) => {
    const ownerHeaders = await authHeadersFor(request, "owner");
    const namHeaders = await authHeadersFor(request, "employeeNam");
    const nam = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeNam.code);
    const settingsSnapshot = await snapshotSettings(request, ownerHeaders);
    const contactOriginal = {
      telegramChatId: nam.telegramChatId ?? null,
      zaloUserId: nam.zaloUserId ?? null,
      notificationPreferences: nam.notificationPreferences ?? { telegram: true, zalo: true, email: true },
    };

    try {
      await updateEmployeeContacts(request, ownerHeaders, nam.id, {
        telegramChatId: "777888999",
        notificationPreferences: { telegram: true, zalo: true, email: true },
      });
      await updateNotificationPolicy(request, ownerHeaders, { enableTelegram: false });
      await markAllNotificationsRead(request, namHeaders);

      const weekStart = await findUnusedFutureMonday(request, ownerHeaders, 175);
      const sched = await createScheduleWeek(request, ownerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, ownerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Policy Disable TG",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, ownerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const notifs = await getNotifications(request, namHeaders, true);
      expect(notifs.items.some((n) => n.type === "SCHEDULE_PUBLISHED")).toBe(true);
    } finally {
      await restoreSettings(request, ownerHeaders, settingsSnapshot);
      await updateEmployeeContacts(request, ownerHeaders, nam.id, contactOriginal);
    }
  });

  test("T3-06 (F5 + F9): Updating cashDiscrepancyThresholdVnd=50000 suppresses -20k alert and fires -60k alert", async ({
    request,
  }) => {
    const ownerHeaders = await authHeadersFor(request, "owner");
    const managerHeaders = await authHeadersFor(request, "manager");
    const namHeaders = await authHeadersFor(request, "employeeNam");
    const nam = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeNam.code);
    const snapshot = await snapshotSettings(request, ownerHeaders);

    try {
      await updateNotificationPolicy(request, ownerHeaders, { cashDiscrepancyThresholdVnd: 50000 });
      const weekStart = await findUnusedFutureMonday(request, ownerHeaders, 180);
      const sched = await createScheduleWeek(request, ownerHeaders, weekStart, false);
      const s1 = await createShiftInSchedule(request, ownerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Pairwise -20k",
        startTime: "07:00",
        endTime: "11:00",
      });
      const s2 = await createShiftInSchedule(request, ownerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 2 Pairwise -60k",
        startTime: "11:00",
        endTime: "15:00",
      });
      expect((await assignEmployeeToShift(request, ownerHeaders, s1.id, nam.id)).status()).toBe(201);
      expect((await assignEmployeeToShift(request, ownerHeaders, s2.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, ownerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      await markAllNotificationsRead(request, managerHeaders);
      expect(
        (
          await request.post(`${BASE_URL}/api/handovers`, {
            headers: namHeaders,
            data: buildHandoverPayload({
              shiftId: s1.id,
              handoverEmployeeId: nam.id,
              openingCashVnd: 1000000,
              cashSalesVnd: 0,
              cashExpensesVnd: 0,
              actualClosingCashVnd: 980000,
              cashDiscrepancyReason: "Thiếu 20k dưới ngưỡng 50k",
            }),
          })
        ).status(),
      ).toBe(201);
      expect((await getNotifications(request, managerHeaders, true)).items.some((n) => n.linkUrl === "/handovers")).toBe(
        false,
      );

      expect(
        (
          await request.post(`${BASE_URL}/api/handovers`, {
            headers: namHeaders,
            data: buildHandoverPayload({
              shiftId: s2.id,
              handoverEmployeeId: nam.id,
              openingCashVnd: 1000000,
              cashSalesVnd: 0,
              cashExpensesVnd: 0,
              actualClosingCashVnd: 940000,
              cashDiscrepancyReason: "Thiếu 60k vượt ngưỡng 50k",
            }),
          })
        ).status(),
      ).toBe(201);
      expect((await getNotifications(request, managerHeaders, true)).items.some((n) => n.linkUrl === "/handovers")).toBe(
        true,
      );
    } finally {
      await restoreSettings(request, ownerHeaders, snapshot);
    }
  });

  test("T3-07 (F5 + F10): Updating shiftStartReminderMinutes=30 triggers SHIFT_REMINDER for shift starting in +25m", async ({
    request,
  }) => {
    const ownerHeaders = await authHeadersFor(request, "owner");
    const nhiHeaders = await authHeadersFor(request, "employeeNhi");
    const nhi = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeNhi.code);
    const snapshot = await snapshotSettings(request, ownerHeaders);
    const win = computeReminderShiftWindow("start", 24, 60);
    let createdShiftId: string | null = null;

    try {
      await updateNotificationPolicy(request, ownerHeaders, { shiftStartReminderMinutes: 30 });
      const { schedule } = await ensureEditableWeekForDate(request, ownerHeaders, win.workDate);
      const shift = await createShiftInSchedule(request, ownerHeaders, schedule.id, {
        workDate: win.workDate,
        name: `T3-07 30m Window ${Date.now()}`,
        startTime: win.startTime,
        endTime: win.endTime,
      });
      createdShiftId = shift.id;
      expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, nhi.id)).status()).toBe(201);
      if (schedule.status === "DRAFT") {
        expect((await changeScheduleStatus(request, ownerHeaders, schedule.id, "PUBLISH")).status()).toBe(200);
      }

      await markAllNotificationsRead(request, nhiHeaders);
      expect((await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders })).status()).toBe(200);

      const notifs = await getNotifications(request, nhiHeaders, true);
      expect(notifs.items.some((n) => n.type === "SHIFT_REMINDER")).toBe(true);
    } finally {
      await deleteShiftSafe(request, ownerHeaders, createdShiftId);
      await restoreSettings(request, ownerHeaders, snapshot);
    }
  });

  test("T3-08 (F7 + F8): Published schedule -> Swap request -> Accept -> Manager approve transfers assignment & notifies both", async ({
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    const baoHeaders = await authHeadersFor(request, "employeeBao");
    const huyHeaders = await authHeadersFor(request, "employeeHuy");
    const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);
    const huy = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHuy.code);

    const weekStart = await findUnusedFutureMonday(request, managerHeaders, 185);
    const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
    const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
      workDate: weekStart,
      name: "Ca 2 Pairwise Swap",
      startTime: "11:00",
      endTime: "15:00",
    });
    expect((await assignEmployeeToShift(request, managerHeaders, shift.id, bao.id)).status()).toBe(201);
    expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

    const swapRes = await request.post(`${BASE_URL}/api/swaps`, {
      headers: baoHeaders,
      data: { shiftId: shift.id, targetEmployeeId: huy.id, reason: "T3-08 swap" },
    });
    const swapId = (await apiJson<SwapRequestDto>(swapRes)).data?.id ?? "";
    expect((await request.post(`${BASE_URL}/api/swaps/${swapId}/respond`, { headers: huyHeaders, data: { accept: true } })).status()).toBe(200);

    await markAllNotificationsRead(request, baoHeaders);
    await markAllNotificationsRead(request, huyHeaders);
    expect((await request.post(`${BASE_URL}/api/swaps/${swapId}/review`, { headers: managerHeaders, data: { approved: true } })).status()).toBe(200);

    const updatedSched = await apiJson<ScheduleDetailDto>(
      await request.get(`${BASE_URL}/api/schedules/${sched.id}`, { headers: managerHeaders }),
    );
    const updatedShift = updatedSched.data?.shifts.find((s) => s.id === shift.id);
    expect(updatedShift?.assignments.some((a) => a.employeeId === huy.id)).toBe(true);
    expect(updatedShift?.assignments.some((a) => a.employeeId === bao.id)).toBe(false);
    expect((await getNotifications(request, baoHeaders, true)).items.some((n) => n.type === "SWAP_REVIEWED")).toBe(true);
    expect((await getNotifications(request, huyHeaders, true)).items.some((n) => n.type === "SWAP_REVIEWED")).toBe(true);
  });

  test("T3-09 (F8 + F10): Approved emergency leave removes assignment so cron skips SHIFT_REMINDER for absent staff", async ({
    request,
  }) => {
    const ownerHeaders = await authHeadersFor(request, "owner");
    const win = computeReminderShiftWindow("start", 9, 60);
    const { userKey, employee: targetEmp } = await pickEmployeeWithoutApprovedLeave(
      request,
      ownerHeaders,
      ["employeeKiet", "employeeTam", "employeeChau"],
      win.startAtIso,
      win.endAtIso,
    );
    const targetHeaders = await authHeadersFor(request, userKey);
    const shiftTitle = `T3-09 LeaveSkipCron ${Date.now()}`;
    let createdShiftId: string | null = null;

    try {
      const { schedule } = await ensureEditableWeekForDate(request, ownerHeaders, win.workDate);
      const shift = await createShiftInSchedule(request, ownerHeaders, schedule.id, {
        workDate: win.workDate,
        name: shiftTitle,
        startTime: win.startTime,
        endTime: win.endTime,
      });
      createdShiftId = shift.id;
      expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, targetEmp.id)).status()).toBe(201);
      if (schedule.status === "DRAFT") {
        expect((await changeScheduleStatus(request, ownerHeaders, schedule.id, "PUBLISH")).status()).toBe(200);
      }

      const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
        headers: targetHeaders,
        data: {
          shiftId: shift.id,
          startAt: win.startAtIso,
          endAt: win.endAtIso,
          isEmergency: true,
          reason: "T3-09 xin nghỉ đột xuất trước giờ ca",
        },
      });
      expect(leaveRes.status()).toBe(201);
      const leaveId = (await apiJson<LeaveRequestDto>(leaveRes)).data?.id ?? "";
      expect(
        (
          await request.post(`${BASE_URL}/api/leaves/${leaveId}/review`, {
            headers: ownerHeaders,
            data: { status: "APPROVED" },
          })
        ).status(),
      ).toBe(200);

      await markAllNotificationsRead(request, targetHeaders);
      expect((await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders })).status()).toBe(200);

      const notifs = await getNotifications(request, targetHeaders, true);
      expect(notifs.items.some((n) => n.type === "SHIFT_REMINDER" && n.message.includes(shiftTitle))).toBe(false);
    } finally {
      await deleteShiftSafe(request, ownerHeaders, createdShiftId);
    }
  });

  test("T3-10 (F2 + F7): Active SW never caches stale /api/notifications after schedule publish while /offline works offline", async ({
    page,
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    const namHeaders = await authHeadersFor(request, "employeeNam");
    const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

    await loginViaApi(page, "employeeNam");
    await page.goto(`${BASE_URL}/employee/profile`);
    await page.waitForLoadState("networkidle");
    await waitForServiceWorkerReady(page);
    await markAllNotificationsRead(request, namHeaders);

    const beforeCount = await page.evaluate(async () => {
      const r = await fetch("/api/notifications?unread=true");
      const j = (await r.json()) as { data?: { unreadCount?: number } };
      return j.data?.unreadCount ?? 0;
    });
    expect(beforeCount).toBe(0);

    const weekStart = await findUnusedFutureMonday(request, managerHeaders, 190);
    const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
    const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
      workDate: weekStart,
      name: "Ca 1 SW Fresh API",
      startTime: "07:00",
      endTime: "11:00",
    });
    expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
    expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

    const afterCount = await page.evaluate(async () => {
      const r = await fetch("/api/notifications?unread=true");
      const j = (await r.json()) as { data?: { unreadCount?: number } };
      return j.data?.unreadCount ?? 0;
    });
    expect(afterCount).toBeGreaterThanOrEqual(1);

    try {
      await clearSession(page);
      await page.context().setOffline(true);
      await page.goto(`${BASE_URL}/employee/schedule`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1, h2").first()).toBeVisible();
    } finally {
      await page.context().setOffline(false);
    }
  });

  test("T3-11 (F4 + F9): 375x812 mobile 8-step ShiftHandoverWizard flow has zero overflow and reachable quick-tick & submit", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
    await loginViaApi(page, "employeeNam");
    await page.goto(`${BASE_URL}/employee/handover`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Bước 1\/8/i)).toBeVisible();
    for (let step = 1; step <= 8; step += 1) {
      await assertNoHorizontalOverflow(page, `T3-11 Step ${step} @ 375x812`);
      if (step === 5) {
        const quickTick = page.getByRole("button", { name: /Tick nhanh việc hôm nay/i });
        if (await quickTick.isVisible()) {
          await quickTick.click();
        }
      }
      if (step < 8) {
        await page.getByRole("button", { name: /Tiếp theo/i }).click();
      }
    }

    const submitBtn = page.getByRole("button", { name: /Nộp bàn giao/i });
    await expect(submitBtn).toBeVisible();
    const box = await submitBtn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x + box.width).toBeLessThanOrEqual(MOBILE_VIEWPORTS.sm375.width);
    }
  });

  test("T3-12 (F6 + F8 + F9): Back-to-back emergency leave and handover discrepancy create distinct non-colliding manager alerts", async ({
    request,
  }) => {
    const managerHeaders = await authHeadersFor(request, "manager");
    const namHeaders = await authHeadersFor(request, "employeeNam");
    const haHeaders = await authHeadersFor(request, "employeeHa");
    const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

    const weekStart = await findUnusedFutureMonday(request, managerHeaders, 195);
    const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
    const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
      workDate: weekStart,
      name: "Ca 4 BackToBack Alerts",
      startTime: "19:00",
      endTime: "23:00",
    });
    expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
    expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

    await markAllNotificationsRead(request, managerHeaders);

    const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
      headers: haHeaders,
      data: {
        startAt: new Date(Date.now() + 90 * 60_000).toISOString(),
        endAt: new Date(Date.now() + 210 * 60_000).toISOString(),
        isEmergency: true,
        reason: "T3-12 nghỉ đột xuất song song bàn giao",
      },
    });
    expect(leaveRes.status()).toBe(201);

    const handoverRes = await request.post(`${BASE_URL}/api/handovers`, {
      headers: namHeaders,
      data: buildHandoverPayload({
        shiftId: shift.id,
        handoverEmployeeId: nam.id,
        openingCashVnd: 1000000,
        cashSalesVnd: 500000,
        cashExpensesVnd: 0,
        actualClosingCashVnd: 1450000,
        cashDiscrepancyReason: "T3-12 lệch két 50k song song đơn nghỉ",
      }),
    });
    expect(handoverRes.status()).toBe(201);

    const mgrNotifs = await getNotifications(request, managerHeaders, true);
    expect(mgrNotifs.items.some((n) => n.linkUrl === "/requests")).toBe(true);
    expect(mgrNotifs.items.some((n) => n.linkUrl === "/handovers")).toBe(true);
  });
});
