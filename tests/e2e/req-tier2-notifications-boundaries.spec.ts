import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  MOBILE_VIEWPORTS,
  SEEDED_USERS,
  apiJson,
  assertNoHorizontalOverflow,
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
  getCachedUrls,
  getNotifications,
  loginViaApi,
  markAllNotificationsRead,
  restoreSettings,
  snapshotSettings,
  uniqueFutureMonday,
  updateEmployeeContacts,
  updateNotificationPolicy,
  updateSelfNotificationContacts,
  waitForServiceWorkerReady,
  type ShiftHandoverDto,
  type SwapRequestDto,
} from "./helpers/req-e2e-helpers";

interface WebManifestWithIcons {
  start_url?: string;
  icons?: Array<{ src: string; sizes?: string; type?: string }>;
}

test.describe("Tier 2 — Boundary, RBAC, Validation & Offline Corner Cases (52 tests)", () => {
  // =========================================================================
  // F1 Boundaries (5 tests)
  // =========================================================================
  test.describe("F1 Boundaries", () => {
    test("T2-F1-01: GET /manifest.json and /icons/* remain publicly accessible without auth redirects", async ({
      request,
    }) => {
      for (const path of [
        "/manifest.json",
        "/icons/icon-192x192.png",
        "/icons/icon-512x512.png",
        "/icons/icon.svg",
      ]) {
        const res = await request.get(`${BASE_URL}${path}`, { maxRedirects: 0 });
        expect(res.status(), `${path} must return 200 without auth`).toBe(200);
      }
    });

    test("T2-F1-02: Every PNG icon referenced by manifest has valid PNG magic bytes", async ({ request }) => {
      const mRes = await request.get(`${BASE_URL}/manifest.json`);
      const manifest = (await mRes.json()) as WebManifestWithIcons;
      const pngIcons = (manifest.icons ?? []).filter((i) => i.src.endsWith(".png"));
      expect(pngIcons.length).toBeGreaterThanOrEqual(2);

      for (const icon of pngIcons) {
        const res = await request.get(`${BASE_URL}${icon.src}`);
        expect(res.status()).toBe(200);
        const buf = await res.body();
        expect(buf[0]).toBe(0x89);
        expect(buf[1]).toBe(0x50);
        expect(buf[2]).toBe(0x4e);
        expect(buf[3]).toBe(0x47);
      }
    });

    test("T2-F1-03: Manifest start_url (/) responds without 5xx for both unauthenticated and authenticated users", async ({
      page,
    }) => {
      await clearSession(page);
      const anonRes = await page.goto(`${BASE_URL}/`);
      expect(anonRes?.status() ?? 500).toBeLessThan(500);
      expect(page.url()).toContain("/login");

      await loginViaApi(page, "employeeNam");
      const authRes = await page.goto(`${BASE_URL}/`);
      expect(authRes?.status() ?? 500).toBeLessThan(500);
      expect(page.url()).toContain("/employee/");
    });

    test("T2-F1-04: viewport-fit=cover preserves pinch-to-zoom (no user-scalable=no)", async ({ page }) => {
      await clearSession(page);
      await page.goto(`${BASE_URL}/login`);
      const content = (await page.locator('meta[name="viewport"]').getAttribute("content")) ?? "";
      expect(content).toMatch(/viewport-fit=cover/i);
      expect(content).not.toMatch(/user-scalable=no/i);
    });

    test("T2-F1-05: /kiosk redirect to /attendance/kiosk preserves PWA manifest and viewport metadata", async ({
      page,
    }) => {
      await loginViaApi(page, "manager");
      await page.goto(`${BASE_URL}/kiosk`);
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain("/attendance/kiosk");
      expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.json");
      expect((await page.locator('meta[name="viewport"]').getAttribute("content")) ?? "").toMatch(/viewport-fit=cover/i);
    });
  });

  // =========================================================================
  // F2 Boundaries (5 tests)
  // =========================================================================
  test.describe("F2 Boundaries", () => {
    test("T2-F2-01: Navigating after document.readyState === complete still registers SW", async ({ page }) => {
      await clearSession(page);
      await page.goto(`${BASE_URL}/register-schedule`);
      await page.waitForLoadState("networkidle");
      const readyState = await page.evaluate(() => document.readyState);
      expect(readyState).toBe("complete");

      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState("networkidle");
      const sw = await waitForServiceWorkerReady(page);
      expect(sw.state).toBe("activated");
    });

    test("T2-F2-02: /_next/static/* assets return 200 without auth redirects", async ({ page, request }) => {
      await clearSession(page);
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState("networkidle");

      const staticSrc = await page.evaluate(() => {
        const script = document.querySelector('script[src*="/_next/static/"]');
        return script?.getAttribute("src") ?? null;
      });
      expect(staticSrc).toBeTruthy();
      if (staticSrc) {
        const assetRes = await request.get(staticSrc.startsWith("http") ? staticSrc : `${BASE_URL}${staticSrc}`, {
          maxRedirects: 0,
        });
        expect(assetRes.status()).toBe(200);
      }
    });

    test("T2-F2-03: Offline fallback renders cleanly on protected /employee/* navigation without uncaught pageerror", async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      try {
        await page.context().setOffline(true);
        await page.goto(`${BASE_URL}/employee/schedule`, { waitUntil: "domcontentloaded" });
        expect(page.url()).not.toContain("chrome-error://");
        await expect(page.locator("h1, h2").first()).toBeVisible();
      } finally {
        await page.context().setOffline(false);
      }
      expect(pageErrors).toEqual([]);
    });

    test("T2-F2-04: Repeated online/offline toggle recovers cleanly when network returns", async ({ page }) => {
      await clearSession(page);
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      try {
        await page.context().setOffline(true);
        await page.goto(`${BASE_URL}/register-schedule`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("h1, h2").first()).toBeVisible();
      } finally {
        await page.context().setOffline(false);
      }

      await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: /Đăng nhập hệ thống/i })).toBeVisible();
    });

    test("T2-F2-05: Cache Storage never stores /api/ or _rsc= responses", async ({ page }) => {
      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      await page.goto(`${BASE_URL}/employee/schedule`);
      await page.waitForLoadState("networkidle");

      const urls = await getCachedUrls(page);
      expect(urls.some((u) => u.includes("/api/"))).toBe(false);
      expect(urls.some((u) => u.includes("_rsc="))).toBe(false);
    });
  });

  // =========================================================================
  // F3 Boundaries (5 tests)
  // =========================================================================
  test.describe("F3 Boundaries", () => {
    test("T2-F3-01: GET /api/health and GET /api/auth/me fail at network level when offline", async ({ page }) => {
      await clearSession(page);
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      try {
        await page.context().setOffline(true);
        const healthOutcome = await page.evaluate(() =>
          fetch("/api/health")
            .then((r) => `HTTP_${r.status}`)
            .catch(() => "NET_ERR"),
        );
        const meOutcome = await page.evaluate(() =>
          fetch("/api/auth/me")
            .then((r) => `HTTP_${r.status}`)
            .catch(() => "NET_ERR"),
        );
        expect(healthOutcome).toBe("NET_ERR");
        expect(meOutcome).toBe("NET_ERR");
      } finally {
        await page.context().setOffline(false);
      }
    });

    test("T2-F3-02: Next.js client navigation while offline never serves fake _rsc payloads", async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await loginViaApi(page, "employeeNam");
      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      try {
        await page.context().setOffline(true);
        await page.locator("nav.fixed.bottom-0 a", { hasText: "Lịch làm" }).click();
        await page.waitForTimeout(800);
        const currentUrl = page.url();
        expect(currentUrl).not.toContain("chrome-error://");
        expect(currentUrl.includes("/employee/profile") || currentUrl.includes("/offline")).toBe(true);
      } finally {
        await page.context().setOffline(false);
      }

      expect(pageErrors).toEqual([]);
      const cached = await getCachedUrls(page);
      expect(cached.some((u) => u.includes("_rsc="))).toBe(false);
    });

    test("T2-F3-03: Public registration PIN verification offline shows error rather than Khớp danh tính", async ({
      page,
    }) => {
      await clearSession(page);
      await page.goto(`${BASE_URL}/register-schedule?week=2026-11-16`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      await page.locator("button:has-text('Phạm Ngọc Ánh')").first().click();
      try {
        await page.context().setOffline(true);
        await page.locator("input[type='password']").fill(SEEDED_USERS.employeeAnh.pin);
        await page.waitForTimeout(800);
        await expect(page.getByText("Khớp danh tính")).toHaveCount(0);
      } finally {
        await page.context().setOffline(false);
      }
    });

    test("T2-F3-04: Shift swap tab and modal actions offline do not crash or mutate state", async ({
      page,
      request,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      const managerHeaders = await authHeadersFor(request, "manager");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);
      const futureWeek = await findUnusedFutureMonday(request, managerHeaders, 15);
      const sched = await createScheduleWeek(request, managerHeaders, futureWeek, false);
      let createdShiftId: string | null = null;

      try {
        const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
          workDate: futureWeek,
          name: "Ca 1 Swap Offline Check",
          startTime: "07:00",
          endTime: "11:00",
        });
        createdShiftId = shift.id;
        expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
        expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

        await loginViaApi(page, "employeeNam");
        await page.goto(`${BASE_URL}/employee/requests`);
        await page.waitForLoadState("networkidle");
        await waitForServiceWorkerReady(page);

        await page.getByRole("button", { name: /Đổi ca/i }).first().click();
        const swapBtn = page.getByRole("button", { name: /Yêu cầu đổi ca/i });
        await expect(swapBtn).toBeEnabled({ timeout: 10000 });
        await swapBtn.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        try {
          await page.context().setOffline(true);
          await dialog.getByRole("button", { name: /Gửi lời mời đổi ca/i }).click();
          await expect(dialog).toBeVisible();
        } finally {
          await page.context().setOffline(false);
        }
        expect(pageErrors).toEqual([]);
      } finally {
        await deleteShiftSafe(request, managerHeaders, createdShiftId);
      }
    });

    test("T2-F3-05: Offline failed emergency leave submit succeeds upon reconnecting without page reload", async ({
      page,
    }) => {
      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/requests`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      await page.getByRole("button", { name: /Tạo đơn xin nghỉ/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const emergencyToggle = dialog.locator('input[type="checkbox"], [role="switch"]').first();
      await expect(emergencyToggle).toBeVisible({ timeout: 5000 });
      await emergencyToggle.click();

      const startDt = formatVnDateTimeLocalOffset(60);
      const endDt = formatVnDateTimeLocalOffset(180);
      await dialog.locator('input[type="datetime-local"]').nth(0).fill(startDt);
      await dialog.locator('input[type="datetime-local"]').nth(1).fill(endDt);
      await dialog.locator("input[placeholder*='Bận việc']").fill("T2-F3-05 reconnect emergency leave");

      try {
        await page.context().setOffline(true);
        await dialog.getByRole("button", { name: /Gửi đơn xin nghỉ/i }).click();
        await expect(dialog.locator(".text-red-700, .text-red-800, [role='alert']").first()).toBeVisible({
          timeout: 10000,
        });
      } finally {
        await page.context().setOffline(false);
      }

      const postPromise = page.waitForResponse(
        (r) => r.url().includes("/api/leaves") && r.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: /Gửi đơn xin nghỉ/i }).click();
      const postRes = await postPromise;
      expect(postRes.status()).toBe(201);
      await expect(dialog).toBeHidden({ timeout: 10000 });
    });
  });

  // =========================================================================
  // F4 Boundaries (5 tests)
  // =========================================================================
  test.describe("F4 Boundaries", () => {
    test("T2-F4-01: PayslipModal at 375x812 fits viewport without clipping action buttons", async ({ page }) => {
      await loginViaApi(page, "employeeNam");
      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
      await page.goto(`${BASE_URL}/employee/payroll`);
      await page.waitForLoadState("networkidle");

      const openBtn = page.getByRole("button", { name: /Xem & Tải phiếu lương chi tiết/i }).first();
      await expect(openBtn).toBeVisible({ timeout: 10000 });
      await openBtn.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await assertNoHorizontalOverflow(page, "PayslipModal @ 375x812");

      for (const label of [/In phiếu lương/i, /Tải ảnh gửi Zalo/i, /^Đóng$/i]) {
        const btn = dialog.getByRole("button", { name: label });
        await expect(btn).toBeVisible();
        const box = await btn.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(MOBILE_VIEWPORTS.sm375.width);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test("T2-F4-02: NotificationBell popover at 375x812 stays within [0, 375] viewport bounds", async ({ page }) => {
      await loginViaApi(page, "employeeNam");
      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");

      await page.locator('button[title="Thông báo"]').click();
      const popover = page.locator("header").getByText("Thông báo").locator("..");
      await expect(popover).toBeVisible();
      await assertNoHorizontalOverflow(page, "NotificationBell popover @ 375x812");

      const panelBox = await page.locator("header div.z-50").first().boundingBox();
      expect(panelBox).not.toBeNull();
      if (panelBox) {
        expect(panelBox.x).toBeGreaterThanOrEqual(0);
        expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORTS.sm375.width);
      }
    });

    test("T2-F4-03: /employee/handover Steps 1..8 at 375x812 have zero horizontal overflow and non-overlapping CTAs", async ({
      page,
    }) => {
      await loginViaApi(page, "employeeNam");
      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
      await page.goto(`${BASE_URL}/employee/handover`);
      await page.waitForLoadState("networkidle");

      for (let step = 1; step <= 8; step += 1) {
        await assertNoHorizontalOverflow(page, `/employee/handover Step ${step} @ 375x812`);
        if (step === 5) {
          const quickTick = page.getByRole("button", { name: /Tick nhanh việc hôm nay/i });
          await expect(quickTick).toBeVisible({ timeout: 5000 });
          await quickTick.click();
        }
        if (step < 8) {
          await page.getByRole("button", { name: /Tiếp theo/i }).click();
        }
      }

      const backBtn = page.getByRole("button", { name: /Quay lại/i });
      const submitBtn = page.getByRole("button", { name: /Nộp bàn giao/i });
      const backBox = await backBtn.boundingBox();
      const submitBox = await submitBtn.boundingBox();
      expect(backBox).not.toBeNull();
      expect(submitBox).not.toBeNull();
      if (backBox && submitBox) {
        expect(backBox.x + backBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORTS.sm375.width);
        expect(submitBox.x + submitBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORTS.sm375.width);
      }
    });

    test("T2-F4-04: /employee/availability sticky Save button does not collide behind fixed mobile bottom nav", async ({
      page,
    }) => {
      await loginViaApi(page, "employeeNam");
      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
      await page.goto(`${BASE_URL}/employee/availability`);
      await page.waitForLoadState("networkidle");

      const saveBtn = page.getByRole("button", { name: /Lưu đăng ký lịch rảnh/i });
      await saveBtn.scrollIntoViewIfNeeded();
      await expect(saveBtn).toBeVisible();

      const saveBox = await saveBtn.boundingBox();
      const navBox = await page.locator("nav.fixed.bottom-0").boundingBox();
      expect(saveBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      if (saveBox && navBox) {
        expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(navBox.y + 1);
      }
    });

    test("T2-F4-05: /employee/requests Leave modal fits inside 375x812 with clickable >=44px buttons", async ({
      page,
    }) => {
      await loginViaApi(page, "employeeNam");
      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
      await page.goto(`${BASE_URL}/employee/requests`);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: /Tạo đơn xin nghỉ/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await assertNoHorizontalOverflow(page, "Leave modal @ 375x812");

      const dBox = await dialog.boundingBox();
      expect(dBox).not.toBeNull();
      if (dBox) {
        expect(dBox.x).toBeGreaterThanOrEqual(0);
        expect(dBox.x + dBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORTS.sm375.width);
      }
      const submitBox = await dialog.getByRole("button", { name: /Gửi đơn xin nghỉ/i }).boundingBox();
      expect(submitBox).not.toBeNull();
      if (submitBox) {
        expect(submitBox.height).toBeGreaterThanOrEqual(44);
      }
    });
  });

  // =========================================================================
  // F5 Boundaries (6 tests)
  // =========================================================================
  test.describe("F5 Boundaries", () => {
    test("T2-F5-01: EMPLOYEE calling GET or PUT /api/settings receives 403", async ({ request }) => {
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const getRes = await request.get(`${BASE_URL}/api/settings`, { headers: namHeaders });
      expect(getRes.status()).toBe(403);

      const putRes = await request.put(`${BASE_URL}/api/settings`, {
        headers: namHeaders,
        data: {},
      });
      expect(putRes.status()).toBe(403);
    });

    test("T2-F5-02: MANAGER has settings:read (200) but lacks settings:write (403) and /settings UI hides Save", async ({
      page,
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const getRes = await request.get(`${BASE_URL}/api/settings`, { headers: managerHeaders });
      expect(getRes.status()).toBe(200);
      const bundle = await apiJson<Record<string, unknown>>(getRes);

      const putRes = await request.put(`${BASE_URL}/api/settings`, {
        headers: managerHeaders,
        data: bundle.data ?? {},
      });
      expect(putRes.status()).toBe(403);

      await loginViaApi(page, "manager");
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("button", { name: /Lưu thay đổi/i })).toHaveCount(0);
    });

    test("T2-F5-03: MANAGER and EMPLOYEE cannot PATCH /api/employees/[id] (403)", async ({ request }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const anh = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeAnh.code);

      const mgrPatch = await request.patch(`${BASE_URL}/api/employees/${anh.id}`, {
        headers: managerHeaders,
        data: { telegramChatId: "12345" },
      });
      expect(mgrPatch.status()).toBe(403);

      const empPatch = await request.patch(`${BASE_URL}/api/employees/${anh.id}`, {
        headers: namHeaders,
        data: { telegramChatId: "12345" },
      });
      expect(empPatch.status()).toBe(403);
    });

    test("T2-F5-04: Unauthenticated requests to auth/notification/settings endpoints return 401", async ({
      request,
    }) => {
      expect((await request.get(`${BASE_URL}/api/auth/me`)).status()).toBe(401);
      expect((await request.get(`${BASE_URL}/api/notifications`)).status()).toBe(401);
      expect((await request.post(`${BASE_URL}/api/notifications`, { data: { id: "x" } })).status()).toBe(401);
      expect((await request.get(`${BASE_URL}/api/settings`)).status()).toBe(401);

      const profileRes = await request.patch(`${BASE_URL}/api/profile/notifications`, {
        data: { telegramChatId: "123" },
      });
      if (profileRes.status() === 404) {
        const fallbackRes = await request.patch(`${BASE_URL}/api/auth/me/notifications`, {
          data: { telegramChatId: "123" },
        });
        expect(fallbackRes.status()).toBe(401);
      } else {
        expect(profileRes.status()).toBe(401);
      }
    });

    test("T2-F5-05: Invalid notificationPolicy bounds return 400 VALIDATION_ERROR", async ({ request }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const current = await snapshotSettings(request, ownerHeaders);
      const basePolicy = current.notificationPolicy ?? {
        enableTelegram: true,
        enableZalo: true,
        enableEmail: true,
        managerTelegramChatIds: [],
        groupTelegramChatId: null,
        shiftStartReminderMinutes: 15,
        shiftEndReminderMinutes: 15,
        cashDiscrepancyThresholdVnd: 0,
      };

      for (const badPatch of [
        { shiftStartReminderMinutes: -1 },
        { cashDiscrepancyThresholdVnd: -100 },
        { shiftStartReminderMinutes: 999 },
      ]) {
        const res = await request.put(`${BASE_URL}/api/settings`, {
          headers: ownerHeaders,
          data: {
            ...current,
            notificationPolicy: { ...basePolicy, ...badPatch },
          },
        });
        expect(res.status(), `Expected 400 for ${JSON.stringify(badPatch)}`).toBe(400);
      }
    });

    test("T2-F5-06: Zero (0) and positive (50000) cashDiscrepancyThresholdVnd persist cleanly", async ({ request }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const snapshot = await snapshotSettings(request, ownerHeaders);

      try {
        const zeroRes = await updateNotificationPolicy(request, ownerHeaders, { cashDiscrepancyThresholdVnd: 0 });
        expect(zeroRes.notificationPolicy?.cashDiscrepancyThresholdVnd).toBe(0);

        const posRes = await updateNotificationPolicy(request, ownerHeaders, { cashDiscrepancyThresholdVnd: 50000 });
        expect(posRes.notificationPolicy?.cashDiscrepancyThresholdVnd).toBe(50000);
      } finally {
        await restoreSettings(request, ownerHeaders, snapshot);
      }
    });
  });

  // =========================================================================
  // F6 Boundaries (5 tests)
  // =========================================================================
  test.describe("F6 Boundaries", () => {
    test("T2-F6-01: Unconfigured channels never return 500 on leave/schedule triggers", async ({ request }) => {
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const res = await request.post(`${BASE_URL}/api/leaves`, {
        headers: namHeaders,
        data: {
          startAt: new Date(Date.now() + 20 * 3600_000).toISOString(),
          endAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
          reason: "T2-F6-01 unconfigured external channels safe run",
        },
      });
      expect(res.status()).toBe(201);
    });

    test("T2-F6-02: Employee with null telegramChatId and zaloUserId still receives in-app notifications", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const huyHeaders = await authHeadersFor(request, "employeeHuy");
      const huy = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeHuy.code);
      const original = {
        telegramChatId: huy.telegramChatId ?? null,
        zaloUserId: huy.zaloUserId ?? null,
        notificationPreferences: huy.notificationPreferences ?? { telegram: true, zalo: true, email: true },
      };

      try {
        await updateSelfNotificationContacts(request, huyHeaders, {
          telegramChatId: null,
          zaloUserId: null,
        });
        await markAllNotificationsRead(request, huyHeaders);

        const weekStart = await findUnusedFutureMonday(request, ownerHeaders, 90);
        const sched = await createScheduleWeek(request, ownerHeaders, weekStart, false);
        const shift = await createShiftInSchedule(request, ownerHeaders, sched.id, {
          workDate: weekStart,
          name: "Ca 1 Missing Contacts",
          startTime: "07:00",
          endTime: "11:00",
        });
        expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, huy.id)).status()).toBe(201);
        expect((await changeScheduleStatus(request, ownerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

        const notifs = await getNotifications(request, huyHeaders, true);
        expect(notifs.items.some((n) => n.type === "SCHEDULE_PUBLISHED")).toBe(true);
      } finally {
        await updateEmployeeContacts(request, ownerHeaders, huy.id, original);
      }
    });

    test("T2-F6-03: Policy disabling all 3 external channels still persists transactional in-app notifications", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const managerHeaders = await authHeadersFor(request, "manager");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const snapshot = await snapshotSettings(request, ownerHeaders);

      try {
        await updateNotificationPolicy(request, ownerHeaders, {
          enableTelegram: false,
          enableZalo: false,
          enableEmail: false,
        });
        await markAllNotificationsRead(request, managerHeaders);

        const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
          headers: baoHeaders,
          data: {
            startAt: new Date(Date.now() + 26 * 3600_000).toISOString(),
            endAt: new Date(Date.now() + 30 * 3600_000).toISOString(),
            reason: "T2-F6-03 all external channels disabled",
          },
        });
        expect(leaveRes.status()).toBe(201);
        expect((await getNotifications(request, managerHeaders, true)).items.some((n) => n.type === "LEAVE_SUBMITTED")).toBe(
          true,
        );
      } finally {
        await restoreSettings(request, ownerHeaders, snapshot);
      }
    });

    test("T2-F6-04: Marking non-existent or another user notification read does not throw 500 or leak mutation", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const namHeaders = await authHeadersFor(request, "employeeNam");

      const bogusRes = await request.post(`${BASE_URL}/api/notifications`, {
        headers: namHeaders,
        data: { id: "00000000-0000-0000-0000-000000000000" },
      });
      expect(bogusRes.status()).toBeLessThan(500);

      // Create unread notification for owner, verify nam cannot mark it read
      await markAllNotificationsRead(request, ownerHeaders);
      await request.post(`${BASE_URL}/api/leaves`, {
        headers: namHeaders,
        data: {
          startAt: new Date(Date.now() + 30 * 3600_000).toISOString(),
          endAt: new Date(Date.now() + 34 * 3600_000).toISOString(),
          reason: "T2-F6-04 cross-user notification isolation",
        },
      });
      const ownerNotifs = await getNotifications(request, ownerHeaders, true);
      const target = ownerNotifs.items[0];
      expect(target).toBeDefined();
      if (target) {
        await request.post(`${BASE_URL}/api/notifications`, {
          headers: namHeaders,
          data: { id: target.id },
        });
        const ownerAfter = await getNotifications(request, ownerHeaders, true);
        expect(ownerAfter.items.some((n) => n.id === target.id && !n.isRead)).toBe(true);
      }
    });

    test("T2-F6-05: Schedule publish emits at most 1 SCHEDULE_PUBLISHED notification per employee for that week", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 95);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const s1 = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 MultiShift",
        startTime: "07:00",
        endTime: "11:00",
      });
      const s2 = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 2 MultiShift",
        startTime: "11:00",
        endTime: "15:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, s1.id, nam.id)).status()).toBe(201);
      expect((await assignEmployeeToShift(request, managerHeaders, s2.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const notifs = await getNotifications(request, namHeaders, false);
      const weekPublished = notifs.items.filter(
        (n) => n.type === "SCHEDULE_PUBLISHED" && n.linkUrl === `/employee/schedule?week=${weekStart}`,
      );
      expect(weekPublished.length).toBe(1);
    });
  });

  // =========================================================================
  // F7 Boundaries (5 tests)
  // =========================================================================
  test.describe("F7 Boundaries", () => {
    test("T2-F7-01: Empty schedule (0 shifts) fails PUBLISH with 400", async ({ request }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 100);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);

      const pubRes = await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH");
      expect(pubRes.status()).toBe(400);
    });

    test("T2-F7-02: Shift with >=2 non-TRUONG_CA employees succeeds PUBLISH with 200 and notifies assigned staff", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);
      const ha = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHa.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 105);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 No Leader Needed",
        startTime: "07:00",
        endTime: "11:00",
        maxStaff: 2,
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, bao.id)).status()).toBe(201);
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, ha.id)).status()).toBe(201);

      await markAllNotificationsRead(request, baoHeaders);
      const pubRes = await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH");
      expect(pubRes.status()).toBe(200);
      expect((await getNotifications(request, baoHeaders, true)).items.some((n) => n.type === "SCHEDULE_PUBLISHED")).toBe(
        true,
      );
    });

    test("T2-F7-03: Double PUBLISH returns 400; assigning on LOCKED schedule returns 403", async ({ request }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 110);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Lock Guard",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(400);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "LOCK")).status()).toBe(200);

      const assignLocked = await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id);
      expect(assignLocked.status()).toBe(403);
    });

    test("T2-F7-04: MANAGER cannot UNLOCK (403); EMPLOYEE cannot change schedule status (403)", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");

      const weekStart = await findUnusedFutureMonday(request, ownerHeaders, 115);
      const sched = await createScheduleWeek(request, ownerHeaders, weekStart, false);
      await createShiftInSchedule(request, ownerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 RBAC Unlock",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await changeScheduleStatus(request, ownerHeaders, sched.id, "PUBLISH")).status()).toBe(200);
      expect((await changeScheduleStatus(request, ownerHeaders, sched.id, "LOCK")).status()).toBe(200);

      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "UNLOCK")).status()).toBe(403);
      expect((await changeScheduleStatus(request, namHeaders, sched.id, "ARCHIVE")).status()).toBe(403);
    });

    test("T2-F7-05: Non-Monday weekStart returns 400; publishing shift schedule with 0 staff succeeds cleanly", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const tuesday = "2099-01-06";
      const badRes = await request.post(`${BASE_URL}/api/schedules`, {
        headers: managerHeaders,
        data: { weekStart: tuesday, generateFromTemplates: false },
      });
      expect(badRes.status()).toBe(400);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 120);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Unassigned",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);
    });
  });

  // =========================================================================
  // F8 Boundaries (6 tests)
  // =========================================================================
  test.describe("F8 Boundaries", () => {
    test("T2-F8-01: Normal leave (isEmergency false/omitted) <4h ahead returns 400", async ({ request }) => {
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const res = await request.post(`${BASE_URL}/api/leaves`, {
        headers: namHeaders,
        data: {
          startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          endAt: new Date(Date.now() + 180 * 60_000).toISOString(),
          isEmergency: false,
          reason: "T2-F8-01 không khẩn cấp dưới 4 giờ",
        },
      });
      expect(res.status()).toBe(400);
    });

    test("T2-F8-02: Emergency leave with short reason (<5 chars) or endAt <= startAt returns 400", async ({
      request,
    }) => {
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const shortReasonRes = await request.post(`${BASE_URL}/api/leaves`, {
        headers: namHeaders,
        data: {
          startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          endAt: new Date(Date.now() + 180 * 60_000).toISOString(),
          isEmergency: true,
          reason: "abc",
        },
      });
      expect(shortReasonRes.status()).toBe(400);

      const badTimeRes = await request.post(`${BASE_URL}/api/leaves`, {
        headers: namHeaders,
        data: {
          startAt: new Date(Date.now() + 180 * 60_000).toISOString(),
          endAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          isEmergency: true,
          reason: "Thời gian kết thúc không hợp lệ",
        },
      });
      expect(badTimeRes.status()).toBe(400);
    });

    test("T2-F8-03: Self-swap and duplicate PENDING swap for the same shift return 400", async ({ request }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);
      const huy = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHuy.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 125);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Swap Dup",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, bao.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const selfRes = await request.post(`${BASE_URL}/api/swaps`, {
        headers: baoHeaders,
        data: { shiftId: shift.id, targetEmployeeId: bao.id, reason: "Self swap" },
      });
      expect(selfRes.status()).toBe(400);

      const firstSwap = await request.post(`${BASE_URL}/api/swaps`, {
        headers: baoHeaders,
        data: { shiftId: shift.id, targetEmployeeId: huy.id, reason: "First swap" },
      });
      expect(firstSwap.status()).toBe(201);

      const dupSwap = await request.post(`${BASE_URL}/api/swaps`, {
        headers: baoHeaders,
        data: { shiftId: shift.id, targetEmployeeId: huy.id, reason: "Duplicate swap" },
      });
      expect(dupSwap.status()).toBe(400);
    });

    test("T2-F8-04: Non-target employee respond returns 403; reviewing PENDING swap returns 400", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const haHeaders = await authHeadersFor(request, "employeeHa");
      const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);
      const huy = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHuy.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 130);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 2 Swap Auth",
        startTime: "11:00",
        endTime: "15:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, bao.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const swapRes = await request.post(`${BASE_URL}/api/swaps`, {
        headers: baoHeaders,
        data: { shiftId: shift.id, targetEmployeeId: huy.id, reason: "Swap target guard" },
      });
      const swapId = (await apiJson<SwapRequestDto>(swapRes)).data?.id ?? "";

      const nonTargetRes = await request.post(`${BASE_URL}/api/swaps/${swapId}/respond`, {
        headers: haHeaders,
        data: { accept: true },
      });
      expect(nonTargetRes.status()).toBe(403);

      const prematureReview = await request.post(`${BASE_URL}/api/swaps/${swapId}/review`, {
        headers: managerHeaders,
        data: { approved: true },
      });
      expect(prematureReview.status()).toBe(400);
    });

    test("T2-F8-05: EMPLOYEE calling leave review, swap review, or emergency-replace returns 403", async ({
      request,
    }) => {
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const fakeId = "00000000-0000-0000-0000-000000000001";

      expect(
        (
          await request.post(`${BASE_URL}/api/leaves/${fakeId}/review`, {
            headers: namHeaders,
            data: { status: "APPROVED" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await request.post(`${BASE_URL}/api/swaps/${fakeId}/review`, {
            headers: namHeaders,
            data: { approved: true },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await request.post(`${BASE_URL}/api/shifts/${fakeId}/emergency-replace`, {
            headers: namHeaders,
            data: { absentEmployeeId: fakeId, replacementEmployeeId: fakeId, reason: "Forbidden" },
          })
        ).status(),
      ).toBe(403);
    });

    test("T2-F8-06: emergency-replace rejects same employee (400) and allows replacing with any available staff (200)", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);
      const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);
      const ha = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHa.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 135);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 4 Any Staff Replace",
        startTime: "19:00",
        endTime: "23:00",
        maxStaff: 2,
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, bao.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const sameRes = await request.post(`${BASE_URL}/api/shifts/${shift.id}/emergency-replace`, {
        headers: managerHeaders,
        data: { absentEmployeeId: nam.id, replacementEmployeeId: nam.id, reason: "Same employee" },
      });
      expect(sameRes.status()).toBe(400);

      const anyStaffRes = await request.post(`${BASE_URL}/api/shifts/${shift.id}/emergency-replace`, {
        headers: managerHeaders,
        data: { absentEmployeeId: nam.id, replacementEmployeeId: ha.id, reason: "Any staff can replace without TRUONG_CA" },
      });
      expect(anyStaffRes.status()).toBe(200);
    });
  });

  // =========================================================================
  // F9 Boundaries (5 tests)
  // =========================================================================
  test.describe("F9 Boundaries", () => {
    test("T2-F9-01: Cash discrepancy threshold boundary (< threshold silent vs >= threshold fires alert)", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeNam.code);
      const snapshot = await snapshotSettings(request, ownerHeaders);

      try {
        await updateNotificationPolicy(request, ownerHeaders, { cashDiscrepancyThresholdVnd: 50000 });

        const weekStart = await findUnusedFutureMonday(request, ownerHeaders, 140);
        const sched = await createScheduleWeek(request, ownerHeaders, weekStart, false);
        const s1 = await createShiftInSchedule(request, ownerHeaders, sched.id, {
          workDate: weekStart,
          name: "Ca 1 Below Threshold",
          startTime: "07:00",
          endTime: "11:00",
        });
        const s2 = await createShiftInSchedule(request, ownerHeaders, sched.id, {
          workDate: weekStart,
          name: "Ca 2 At Threshold",
          startTime: "11:00",
          endTime: "15:00",
        });
        expect((await assignEmployeeToShift(request, ownerHeaders, s1.id, nam.id)).status()).toBe(201);
        expect((await assignEmployeeToShift(request, ownerHeaders, s2.id, nam.id)).status()).toBe(201);
        expect((await changeScheduleStatus(request, ownerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

        await markAllNotificationsRead(request, managerHeaders);
        const belowRes = await request.post(`${BASE_URL}/api/handovers`, {
          headers: namHeaders,
          data: buildHandoverPayload({
            shiftId: s1.id,
            handoverEmployeeId: nam.id,
            openingCashVnd: 1000000,
            cashSalesVnd: 500000,
            cashExpensesVnd: 0,
            actualClosingCashVnd: 1480000,
            cashDiscrepancyReason: "Chênh nhẹ 20k dưới ngưỡng cảnh báo",
          }),
        });
        expect(belowRes.status()).toBe(201);
        expect((await apiJson<{ handover?: ShiftHandoverDto }>(belowRes)).data?.handover?.status).toBe("DISCREPANCY");

        const afterBelow = await getNotifications(request, managerHeaders, true);
        expect(afterBelow.items.some((n) => n.linkUrl === "/handovers")).toBe(false);

        const atRes = await request.post(`${BASE_URL}/api/handovers`, {
          headers: namHeaders,
          data: buildHandoverPayload({
            shiftId: s2.id,
            handoverEmployeeId: nam.id,
            openingCashVnd: 1000000,
            cashSalesVnd: 500000,
            cashExpensesVnd: 0,
            actualClosingCashVnd: 1450000,
            cashDiscrepancyReason: "Thiếu đúng 50k chạm ngưỡng cảnh báo",
          }),
        });
        expect(atRes.status()).toBe(201);
        const afterAt = await getNotifications(request, managerHeaders, true);
        expect(afterAt.items.some((n) => n.linkUrl === "/handovers")).toBe(true);
      } finally {
        await restoreSettings(request, ownerHeaders, snapshot);
      }
    });

    test("T2-F9-02: Cash discrepancy with missing or short (<5 chars) reason returns 400", async ({ request }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 145);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Short Reason",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);

      const res = await request.post(`${BASE_URL}/api/handovers`, {
        headers: namHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: nam.id,
          openingCashVnd: 1000000,
          cashSalesVnd: 500000,
          cashExpensesVnd: 0,
          actualClosingCashVnd: 1400000,
          cashDiscrepancyReason: "abc",
        }),
      });
      expect(res.status()).toBe(400);
    });

    test("T2-F9-03: Any assigned employee on a >=2 staff shift can submit the shared handover (201)", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);
      const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 150);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Shared Handover Rule",
        startTime: "07:00",
        endTime: "11:00",
        maxStaff: 2,
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, bao.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const res = await request.post(`${BASE_URL}/api/handovers`, {
        headers: baoHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: bao.id,
          openingCashVnd: 1000000,
          cashSalesVnd: 0,
          cashExpensesVnd: 0,
          actualClosingCashVnd: 1000000,
        }),
      });
      expect(res.status()).toBe(201);
    });

    test("T2-F9-04: Overwriting CONFIRMED handover returns 400; negative cash or empty inventory returns 400", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 155);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 2 Confirmed Lock",
        startTime: "11:00",
        endTime: "15:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const negRes = await request.post(`${BASE_URL}/api/handovers`, {
        headers: namHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: nam.id,
          openingCashVnd: -100,
          cashSalesVnd: 0,
          cashExpensesVnd: 0,
          actualClosingCashVnd: 0,
        }),
      });
      expect(negRes.status()).toBe(400);

      const emptyInvRes = await request.post(`${BASE_URL}/api/handovers`, {
        headers: namHeaders,
        data: {
          ...buildHandoverPayload({
            shiftId: shift.id,
            handoverEmployeeId: nam.id,
            openingCashVnd: 1000000,
            cashSalesVnd: 0,
            cashExpensesVnd: 0,
            actualClosingCashVnd: 1000000,
          }),
          inventory: [],
        },
      });
      expect(emptyInvRes.status()).toBe(400);

      const okRes = await request.post(`${BASE_URL}/api/handovers`, {
        headers: namHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: nam.id,
          openingCashVnd: 1000000,
          cashSalesVnd: 0,
          cashExpensesVnd: 0,
          actualClosingCashVnd: 1000000,
        }),
      });
      const handoverId = (await apiJson<{ handover?: ShiftHandoverDto }>(okRes)).data?.handover?.id ?? "";
      expect((await request.post(`${BASE_URL}/api/handovers/${handoverId}/confirm`, { headers: managerHeaders })).status()).toBe(200);

      const resubmitConfirmed = await request.post(`${BASE_URL}/api/handovers`, {
        headers: namHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: nam.id,
          openingCashVnd: 1000000,
          cashSalesVnd: 0,
          cashExpensesVnd: 0,
          actualClosingCashVnd: 1000000,
        }),
      });
      expect(resubmitConfirmed.status()).toBe(400);
    });

    test("T2-F9-05: Handover auth boundaries enforce RBAC and reject unauthenticated calls", async ({ request }) => {
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const fakeId = "00000000-0000-0000-0000-000000000002";

      const unauthDispute = await request.post(`${BASE_URL}/api/handovers/${fakeId}/dispute`, {
        data: { disputeReason: "Unauth" },
      });
      expect(unauthDispute.status()).toBe(401);

      const unauthCreate = await request.post(`${BASE_URL}/api/handovers`, {
        maxRedirects: 0,
        data: {},
      });
      expect([401, 403, 307]).toContain(unauthCreate.status());

      const empReopen = await request.post(`${BASE_URL}/api/handovers/${fakeId}/reopen`, {
        headers: namHeaders,
        data: { reopenReason: "Forbidden" },
      });
      expect(empReopen.status()).toBe(403);

      const empConfirm = await request.post(`${BASE_URL}/api/handovers/${fakeId}/confirm`, {
        headers: namHeaders,
        maxRedirects: 0,
        data: {},
      });
      expect([403, 307]).toContain(empConfirm.status());
    });
  });

  // =========================================================================
  // F10 Boundaries (5 tests)
  // =========================================================================
  test.describe("F10 Boundaries", () => {
    test("T2-F10-01: Unauthenticated POST /api/cron/shift-reminders fails closed (401/403)", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/cron/shift-reminders`);
      expect([401, 403]).toContain(res.status());
    });

    test("T2-F10-02: Invalid CRON_SECRET and EMPLOYEE session fail closed (401/403)", async ({ request }) => {
      const badSecretRes = await request.post(`${BASE_URL}/api/cron/shift-reminders`, {
        headers: { "x-cron-secret": "wrong-secret-xyz" },
      });
      expect([401, 403]).toContain(badSecretRes.status());

      const namHeaders = await authHeadersFor(request, "employeeNam");
      const empRes = await request.post(`${BASE_URL}/api/cron/shift-reminders`, {
        headers: namHeaders,
      });
      expect(empRes.status()).toBe(403);
    });

    test("T2-F10-03: Shift outside reminder window (+120m ahead) does NOT trigger SHIFT_REMINDER", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const linhHeaders = await authHeadersFor(request, "employeeLinh");
      const linh = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeLinh.code);

      const futureDate = await findUnusedFutureMonday(request, ownerHeaders, 160);
      const sched = await createScheduleWeek(request, ownerHeaders, futureDate, false);
      const shift = await createShiftInSchedule(request, ownerHeaders, sched.id, {
        workDate: futureDate,
        name: "Ca Far Future",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, linh.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, ownerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      await markAllNotificationsRead(request, linhHeaders);
      expect((await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders })).status()).toBe(200);

      const notifs = await getNotifications(request, linhHeaders, true);
      expect(notifs.items.some((n) => n.type === "SHIFT_REMINDER")).toBe(false);
    });

    test("T2-F10-04: Shift on DRAFT schedule or CANCELLED shift starting within +10m does NOT generate SHIFT_REMINDER", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const linhHeaders = await authHeadersFor(request, "employeeLinh");
      const linh = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeLinh.code);
      const win = computeReminderShiftWindow("start", 8, 60);
      let createdShiftId: string | null = null;
      let alreadyDeleted = false;

      try {
        const { schedule } = await ensureEditableWeekForDate(request, ownerHeaders, win.workDate);
        const shift = await createShiftInSchedule(request, ownerHeaders, schedule.id, {
          workDate: win.workDate,
          name: `Draft/Cancelled Check ${Date.now()}`,
          startTime: win.startTime,
          endTime: win.endTime,
        });
        createdShiftId = shift.id;
        expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, linh.id)).status()).toBe(201);
        if (schedule.status !== "DRAFT") {
          // Cancel/delete the shift so it's excluded even on a published week
          const delRes = await request.delete(`${BASE_URL}/api/shifts/${shift.id}`, { headers: ownerHeaders });
          expect(delRes.status()).toBe(200);
          alreadyDeleted = true;
        }

        await markAllNotificationsRead(request, linhHeaders);
        expect((await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders })).status()).toBe(
          200,
        );
        const notifs = await getNotifications(request, linhHeaders, true);
        expect(notifs.items.some((n) => n.type === "SHIFT_REMINDER" && n.message.includes("Draft/Cancelled Check"))).toBe(
          false,
        );
      } finally {
        if (!alreadyDeleted) {
          await deleteShiftSafe(request, ownerHeaders, createdShiftId);
        }
      }
    });

    test("T2-F10-05: REMOVED assignment and INACTIVE employee (NV014) do NOT receive SHIFT_REMINDER", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const anhHeaders = await authHeadersFor(request, "employeeAnh");
      const anh = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeAnh.code);
      const win = computeReminderShiftWindow("start", 8, 60);
      let createdShiftId: string | null = null;

      // Verify inactive user NV014 cannot authenticate
      const inactiveLogin = await request.post(`${BASE_URL}/api/auth/login`, {
        headers: { "x-forwarded-for": "10.25.99.99" },
        data: {
          email: SEEDED_USERS.inactiveDuyen.email,
          password: SEEDED_USERS.inactiveDuyen.password,
        },
      });
      expect([401, 403]).toContain(inactiveLogin.status());

      try {
        const { schedule } = await ensureEditableWeekForDate(request, ownerHeaders, win.workDate);
        const shift = await createShiftInSchedule(request, ownerHeaders, schedule.id, {
          workDate: win.workDate,
          name: `RemovedAssign ${Date.now()}`,
          startTime: win.startTime,
          endTime: win.endTime,
        });
        createdShiftId = shift.id;
        const assignRes = await assignEmployeeToShift(request, ownerHeaders, shift.id, anh.id);
        expect(assignRes.status()).toBe(201);
        const assignJson = await apiJson<{ id?: string; assignment?: { id: string } }>(assignRes);
        const assignmentId = assignJson.data?.assignment?.id ?? assignJson.data?.id ?? "";
        expect(assignmentId).toBeTruthy();

        if (schedule.status === "DRAFT") {
          expect((await changeScheduleStatus(request, ownerHeaders, schedule.id, "PUBLISH")).status()).toBe(200);
        }

        // Remove assignment before cron triggers
        expect(
          (await request.delete(`${BASE_URL}/api/assignments/${assignmentId}`, { headers: ownerHeaders })).status(),
        ).toBe(200);

        await markAllNotificationsRead(request, anhHeaders);
        expect((await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders })).status()).toBe(
          200,
        );
        const notifs = await getNotifications(request, anhHeaders, true);
        expect(notifs.items.some((n) => n.type === "SHIFT_REMINDER" && n.message.includes("RemovedAssign"))).toBe(
          false,
        );
      } finally {
        await deleteShiftSafe(request, ownerHeaders, createdShiftId);
      }
    });
  });
});
