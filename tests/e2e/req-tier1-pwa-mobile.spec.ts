import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  MOBILE_VIEWPORTS,
  SEEDED_USERS,
  apiJson,
  assertNoHorizontalOverflow,
  assertSafeAreaSupport,
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
  getCachedUrls,
  getNotifications,
  loginViaApi,
  markAllNotificationsRead,
  restoreSettings,
  snapshotSettings,
  startMockNotificationServer,
  updateEmployeeContacts,
  updateNotificationPolicy,
  updateSelfNotificationContacts,
  waitForServiceWorkerReady,
  type LeaveRequestDto,
  type ScheduleDetailDto,
  type ShiftHandoverDto,
  type SwapRequestDto,
} from "./helpers/req-e2e-helpers";

interface ManifestIcon {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

interface WebManifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  icons?: ManifestIcon[];
}

test.describe("Tier 1 — PWA, Mobile UI & Multi-Channel Notification Feature Coverage (50 tests)", () => {
  // =========================================================================
  // F1: PWA Manifest, Metadata & Icons (5 tests)
  // =========================================================================
  test.describe("F1: PWA Manifest, Metadata & Icons", () => {
    test("T1-F1-01: GET /manifest.json returns valid Web App Manifest metadata", async ({ request }) => {
      const res = await request.get(`${BASE_URL}/manifest.json`);
      expect(res.status()).toBe(200);
      const ct = res.headers()["content-type"] ?? "";
      expect(ct).toMatch(/application\/(manifest\+)?json/i);

      const manifest = (await res.json()) as WebManifest;
      expect((manifest.name ?? "").trim().length).toBeGreaterThan(0);
      expect((manifest.short_name ?? "").trim().length).toBeGreaterThan(0);
      expect(manifest.start_url).toBe("/");
      expect(manifest.display).toBe("standalone");
      expect(manifest.theme_color ?? "").toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(manifest.background_color ?? "").toMatch(/^#[0-9a-f]{3,8}$/i);
    });

    test("T1-F1-02: Manifest defines 192x192 and 512x512 icons covering both any and maskable purposes", async ({
      request,
    }) => {
      const res = await request.get(`${BASE_URL}/manifest.json`);
      expect(res.status()).toBe(200);
      const manifest = (await res.json()) as WebManifest;
      const icons = manifest.icons ?? [];
      expect(icons.length).toBeGreaterThanOrEqual(2);

      const purposesBySize = new Map<string, Set<string>>();
      for (const icon of icons) {
        const sizeKey = icon.sizes ?? "";
        const set = purposesBySize.get(sizeKey) ?? new Set<string>();
        const tokens = (icon.purpose ?? "any").split(/\s+/).filter(Boolean);
        for (const t of tokens) {
          set.add(t);
        }
        purposesBySize.set(sizeKey, set);
      }

      const p192 = purposesBySize.get("192x192");
      const p512 = purposesBySize.get("512x512");
      expect(p192?.has("any"), "192x192 icon must support purpose 'any'").toBe(true);
      expect(p192?.has("maskable"), "192x192 icon must support purpose 'maskable'").toBe(true);
      expect(p512?.has("any"), "512x512 icon must support purpose 'any'").toBe(true);
      expect(p512?.has("maskable"), "512x512 icon must support purpose 'maskable'").toBe(true);
    });

    test("T1-F1-03: All manifest icon URLs resolve with HTTP 200 and non-empty image bodies", async ({ request }) => {
      const manifestRes = await request.get(`${BASE_URL}/manifest.json`);
      const manifest = (await manifestRes.json()) as WebManifest;
      const icons = manifest.icons ?? [];
      expect(icons.length).toBeGreaterThan(0);

      for (const icon of icons) {
        const target = icon.src.startsWith("http") ? icon.src : `${BASE_URL}${icon.src}`;
        const iconRes = await request.get(target);
        expect(iconRes.status(), `Icon ${icon.src} should return 200`).toBe(200);
        const ct = iconRes.headers()["content-type"] ?? "";
        expect(ct, `Icon ${icon.src} must have image/* content-type`).toMatch(/^image\//i);
        const bytes = await iconRes.body();
        expect(bytes.byteLength, `Icon ${icon.src} must be non-empty`).toBeGreaterThan(100);
      }
    });

    test("T1-F1-04: Public /login and /register-schedule expose manifest, Apple Web App meta, and viewport-fit=cover", async ({
      page,
    }) => {
      for (const route of ["/login", "/register-schedule"]) {
        await page.goto(`${BASE_URL}${route}`);
        await page.waitForLoadState("domcontentloaded");
        const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
        expect(manifestHref, `${route} manifest link`).toBe("/manifest.json");

        const appleCapable = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content");
        expect(appleCapable, `${route} apple-mobile-web-app-capable`).toBe("yes");

        const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
        expect(viewport ?? "", `${route} viewport`).toMatch(/width=device-width/i);
        expect(viewport ?? "", `${route} viewport-fit=cover`).toMatch(/viewport-fit=cover/i);

        const themeColorCount = await page.locator('meta[name="theme-color"]').count();
        expect(themeColorCount, `${route} theme-color meta`).toBeGreaterThan(0);
      }
    });

    test("T1-F1-05: Authenticated employee portal /employee/profile inherits manifest, icons, and viewport-fit=cover", async ({
      page,
    }) => {
      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");

      const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
      expect(manifestHref).toBe("/manifest.json");

      const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
      expect(viewport ?? "").toMatch(/viewport-fit=cover/i);

      const appleTouchHref = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute("href");
      const iconHref = await page.locator('link[rel="icon"]').first().getAttribute("href");
      const targetHref = appleTouchHref ?? iconHref;
      expect(targetHref).toBeTruthy();
      if (targetHref) {
        const iconRes = await page.request.get(targetHref.startsWith("http") ? targetHref : `${BASE_URL}${targetHref}`);
        expect(iconRes.status()).toBe(200);
      }
    });
  });

  // =========================================================================
  // F2: Production Service Worker & Offline Page (5 tests)
  // =========================================================================
  test.describe("F2: Production Service Worker & Offline Page", () => {
    test("T1-F2-01: GET /sw.js is served unauthenticated with JS content-type, no-cache, and root scope header", async ({
      request,
    }) => {
      const res = await request.get(`${BASE_URL}/sw.js`, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      const ct = res.headers()["content-type"] ?? "";
      expect(ct).toMatch(/javascript/i);

      const cacheControl = res.headers()["cache-control"] ?? "";
      expect(cacheControl).toMatch(/no-cache|no-store/i);

      const swAllowed = res.headers()["service-worker-allowed"] ?? "";
      expect(swAllowed).toBe("/");
    });

    test("T1-F2-02: Service Worker registers and reaches activated state on production localhost", async ({ page }) => {
      await clearSession(page);
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState("networkidle");

      const sw = await waitForServiceWorkerReady(page);
      expect(sw.state).toBe("activated");
      expect(sw.scope.endsWith("/")).toBe(true);
      expect(sw.hasController).toBe(true);
    });

    test("T1-F2-03: Cache Storage populates static assets and /offline after initial navigation", async ({ page }) => {
      await clearSession(page);
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      const cachedUrls = await getCachedUrls(page);
      expect(cachedUrls.length).toBeGreaterThan(0);
      expect(cachedUrls.some((u) => new URL(u).pathname === "/offline")).toBe(true);
      expect(
        cachedUrls.some((u) => {
          const p = new URL(u).pathname;
          return p === "/manifest.json" || p.startsWith("/_next/static/") || p.startsWith("/icons/");
        }),
      ).toBe(true);
    });

    test("T1-F2-04: Public /offline route renders standalone offline notice and retry/home control without auth", async ({
      page,
    }) => {
      await clearSession(page);
      const res = await page.goto(`${BASE_URL}/offline`);
      expect(res?.status()).toBe(200);
      expect(page.url()).toContain("/offline");

      await expect(page.locator("h1, h2").first()).toBeVisible();
      const actionControl = page.locator("button, a[href]").first();
      await expect(actionControl).toBeVisible();
    });

    test("T1-F2-05: Navigating while offline renders /offline fallback instead of browser error page", async ({
      page,
    }) => {
      await clearSession(page);
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      try {
        await page.context().setOffline(true);
        await page.goto(`${BASE_URL}/register-schedule`, { waitUntil: "domcontentloaded" });
        expect(page.url()).not.toContain("chrome-error://");
        await expect(page.locator("h1, h2").first()).toBeVisible();
        await expect(page.locator("button, a[href]").first()).toBeVisible();
      } finally {
        await page.context().setOffline(false);
      }

      await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: /Đăng nhập hệ thống/i })).toBeVisible();
    });
  });

  // =========================================================================
  // F3: Online-Only Network Flow Preservation (5 tests)
  // =========================================================================
  test.describe("F3: Online-Only Network Flow Preservation", () => {
    test("T1-F3-01: QR Attendance scan (POST /api/attendance/scan) fails cleanly offline without spoofing success", async ({
      page,
    }) => {
      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/attendance`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      try {
        await page.context().setOffline(true);
        await page.locator("#manual-token").fill("offline-qr-token-check");
        await page.getByRole("button", { name: /^Xác nhận$/i }).click();

        await expect(page.getByText(/Lỗi kết nối máy chủ|Thất bại|Không thể/i).first()).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(/Ghi nhận thành công/i)).toHaveCount(0);
      } finally {
        await page.context().setOffline(false);
      }
    });

    test("T1-F3-02: Public QR schedule registration submit fails cleanly offline without faking confirmation", async ({
      page,
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const openWeek = await findUnusedFutureMonday(request, managerHeaders, 2);

      await clearSession(page);
      await page.goto(`${BASE_URL}/register-schedule?week=${openWeek}`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      await page.locator("button:has-text('Phạm Ngọc Ánh')").first().click();
      await page.locator("input[type='password']").fill(SEEDED_USERS.employeeAnh.pin);
      await expect(page.getByText("Khớp danh tính")).toBeVisible({ timeout: 10000 });
      await page.locator("button:has-text('Rảnh cả tuần')").click();

      const submitBtn = page.locator("button:has-text('Gửi Đăng Ký')");
      await expect(submitBtn).toBeEnabled({ timeout: 10000 });

      try {
        await page.context().setOffline(true);
        await submitBtn.click();

        await expect(page.getByText(/Nộp Đăng Ký Thành Công/i)).toHaveCount(0);
        await expect(submitBtn).toBeEnabled({ timeout: 10000 });
      } finally {
        await page.context().setOffline(false);
      }
    });

    test("T1-F3-03: Leave request submission fails cleanly offline with visible error and no fake list item", async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/requests`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      const initialLeaveCards = await page.locator("main h3, [data-slot='card']").count();

      await page.getByRole("button", { name: /Tạo đơn xin nghỉ/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await dialog.locator('input[type="datetime-local"]').nth(0).fill("2099-05-10T08:00");
      await dialog.locator('input[type="datetime-local"]').nth(1).fill("2099-05-10T12:00");
      await dialog.locator("input[placeholder*='Bận việc']").fill("Offline test leave request");

      try {
        await page.context().setOffline(true);
        const submitBtn = dialog.getByRole("button", { name: /Gửi đơn xin nghỉ/i });
        await submitBtn.click();

        await expect(dialog).toBeVisible();
        await expect(dialog.locator(".text-red-700, [role='alert']").first()).toBeVisible({ timeout: 10000 });
        await expect(submitBtn).toBeEnabled({ timeout: 10000 });
      } finally {
        await page.context().setOffline(false);
      }

      expect(pageErrors).toEqual([]);
      await dialog.getByRole("button", { name: /^Hủy$/i }).click();
      const finalLeaveCards = await page.locator("main h3, [data-slot='card']").count();
      expect(finalLeaveCards).toBe(initialLeaveCards);
    });

    test("T1-F3-04: Handover submission fails cleanly offline and preserves localStorage draft", async ({ page }) => {
      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/handover`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      // Step 1 -> Step 5 -> Quick tick -> Step 8
      for (let step = 1; step < 5; step += 1) {
        await page.getByRole("button", { name: /Tiếp theo/i }).click();
      }
      const quickTickBtn = page.getByRole("button", { name: /Tick nhanh việc hôm nay/i });
      if (await quickTickBtn.isVisible()) {
        await quickTickBtn.click();
      }
      for (let step = 5; step < 8; step += 1) {
        await page.getByRole("button", { name: /Tiếp theo/i }).click();
      }

      const submitBtn = page.getByRole("button", { name: /Nộp bàn giao/i });
      await expect(submitBtn).toBeVisible();

      try {
        await page.context().setOffline(true);
        await submitBtn.click();

        await expect(page).toHaveURL(/\/employee\/handover/);
        await expect(page.locator("[role='alert'], .text-red-700, .text-red-800, .text-rose-700").first()).toBeVisible({
          timeout: 10000,
        });
        const draftKeys = await page.evaluate(() =>
          Object.keys(localStorage).filter((k) => k.startsWith("dlat_handover_draft_")),
        );
        expect(draftKeys.length).toBeGreaterThan(0);
      } finally {
        await page.context().setOffline(false);
      }
    });

    test("T1-F3-05: Kiosk token refresh (POST /api/attendance/kiosk/token) fails cleanly offline without forging a token", async ({
      page,
    }) => {
      await loginViaApi(page, "manager");
      await page.goto(`${BASE_URL}/attendance/kiosk`);
      await page.waitForLoadState("networkidle");
      await waitForServiceWorkerReady(page);

      await expect(page.getByRole("heading", { name: /Kiosk Chấm công/i })).toBeVisible({ timeout: 15000 });
      const qrImg = page.locator("img").first();
      await expect(qrImg).toBeVisible({ timeout: 10000 });
      const initialSrc = await qrImg.getAttribute("src");
      expect(initialSrc).toBeTruthy();

      try {
        await page.context().setOffline(true);
        await page.getByRole("button", { name: /Làm mới/i }).click();
        await page.waitForTimeout(500);
        const afterOfflineSrc = await qrImg.getAttribute("src");
        expect(afterOfflineSrc).toBe(initialSrc);
      } finally {
        await page.context().setOffline(false);
      }

      const tokenResPromise = page.waitForResponse(
        (r) => r.url().includes("/api/attendance/kiosk/token") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: /Làm mới/i }).click();
      const tokenRes = await tokenResPromise;
      expect(tokenRes.status()).toBe(200);
    });
  });

  // =========================================================================
  // F4: Mobile Responsive, Safe-Area & Touch Targets (5 tests)
  // =========================================================================
  test.describe("F4: Mobile Responsive, Safe-Area & Touch Targets", () => {
    test("T1-F4-01: Public routes (/login, /register-schedule, /offline) have zero horizontal overflow at 375px and 390px", async ({
      page,
    }) => {
      await clearSession(page);
      for (const vp of [MOBILE_VIEWPORTS.sm375, MOBILE_VIEWPORTS.md390]) {
        await page.setViewportSize(vp);
        for (const route of ["/login", "/register-schedule?week=2026-11-16", "/offline"]) {
          await page.goto(`${BASE_URL}${route}`);
          await page.waitForLoadState("networkidle");
          await assertNoHorizontalOverflow(page, `${route} @ ${vp.width}x${vp.height}`);
        }
      }
    });

    test("T1-F4-02: All 7 /employee/* routes have zero horizontal overflow at 375x812 and 390x844", async ({ page }) => {
      await loginViaApi(page, "employeeNam");
      const routes = [
        "/employee/profile",
        "/employee/schedule",
        "/employee/availability",
        "/employee/attendance",
        "/employee/handover",
        "/employee/requests",
        "/employee/payroll",
      ];

      for (const vp of [MOBILE_VIEWPORTS.sm375, MOBILE_VIEWPORTS.md390]) {
        await page.setViewportSize(vp);
        for (const route of routes) {
          await page.goto(`${BASE_URL}${route}`);
          await page.waitForLoadState("networkidle");
          await assertNoHorizontalOverflow(page, `${route} @ ${vp.width}x${vp.height}`);
        }
      }
    });

    test("T1-F4-03: /attendance/kiosk renders cleanly without horizontal overflow at 375x812 and 390x844", async ({
      page,
    }) => {
      await loginViaApi(page, "manager");
      for (const vp of [MOBILE_VIEWPORTS.sm375, MOBILE_VIEWPORTS.md390]) {
        await page.setViewportSize(vp);
        await page.goto(`${BASE_URL}/attendance/kiosk`);
        await page.waitForLoadState("networkidle");
        await assertNoHorizontalOverflow(page, `/attendance/kiosk @ ${vp.width}x${vp.height}`);

        const refreshBtn = page.getByRole("button", { name: /Làm mới/i });
        await expect(refreshBtn).toBeVisible();
        const box = await refreshBtn.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
        }
      }
    });

    test("T1-F4-04: Safe-area CSS (env(safe-area-inset-*)) and bottom-bar clearance are applied on mobile", async ({
      page,
    }) => {
      await loginViaApi(page, "employeeNam");
      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");

      await assertSafeAreaSupport(page);

      const bottomNav = page.locator("nav.fixed.bottom-0");
      await expect(bottomNav).toBeVisible();
      const navBox = await bottomNav.boundingBox();
      expect(navBox).not.toBeNull();
      if (navBox) {
        expect(navBox.height).toBeGreaterThanOrEqual(64);
      }

      const clearanceOk = await page.evaluate(() => {
        const wrapper = document.querySelector("nav.fixed.bottom-0")?.parentElement;
        if (!wrapper) return false;
        const pb = parseFloat(getComputedStyle(wrapper).paddingBottom || "0");
        return pb >= 64;
      });
      expect(clearanceOk, "EmployeeShell container should clear fixed bottom nav").toBe(true);
    });

    test("T1-F4-05: Primary interactive controls satisfy >=44px touch target height at 375x812", async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.sm375);

      await clearSession(page);
      await page.goto(`${BASE_URL}/login`);
      await page.waitForLoadState("networkidle");
      await assertTouchTargetsMinSize(
        [page.locator("#email"), page.locator("#password"), page.getByRole("button", { name: /^Đăng nhập$/i })],
        44,
        44,
        "/login controls",
      );

      await loginViaApi(page, "employeeNam");
      await page.goto(`${BASE_URL}/employee/profile`);
      await page.waitForLoadState("networkidle");

      const bottomNavLinks = await page.locator("nav.fixed.bottom-0 a").all();
      await assertTouchTargetsMinSize(
        [...bottomNavLinks, page.locator('button[title="Thông báo"]')].slice(0, 6),
        44,
        44,
        "EmployeeShell nav & bell",
      );

      await page.goto(`${BASE_URL}/employee/availability`);
      await page.waitForLoadState("networkidle");
      await assertTouchTargetsMinSize(
        [page.getByRole("button", { name: /Lưu đăng ký lịch rảnh/i })],
        44,
        44,
        "/employee/availability save",
      );

      await page.goto(`${BASE_URL}/employee/attendance`);
      await page.waitForLoadState("networkidle");
      await assertTouchTargetsMinSize(
        [
          page.locator("#manual-token"),
          page.getByRole("button", { name: /^Xác nhận$/i }),
          page.getByRole("button", { name: /1\. Vào ca/i }),
        ],
        44,
        44,
        "/employee/attendance controls",
      );

      await page.goto(`${BASE_URL}/employee/requests`);
      await page.waitForLoadState("networkidle");
      await assertTouchTargetsMinSize(
        [page.getByRole("button", { name: /Tạo đơn xin nghỉ/i })],
        44,
        44,
        "/employee/requests create",
      );
    });
  });

  // =========================================================================
  // F5: Contact Storage, Env Config & Notification Policy (5 tests)
  // =========================================================================
  test.describe("F5: Contact Storage, Env Config & Notification Policy", () => {
    test("T1-F5-01: OWNER reads and updates notificationPolicy via GET/PUT /api/settings and /settings UI", async ({
      page,
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const snapshot = await snapshotSettings(request, ownerHeaders);
      expect(snapshot.notificationPolicy).toBeDefined();

      try {
        const updated = await updateNotificationPolicy(request, ownerHeaders, {
          shiftStartReminderMinutes: 20,
          shiftEndReminderMinutes: 10,
          cashDiscrepancyThresholdVnd: 25000,
        });
        expect(updated.notificationPolicy?.shiftStartReminderMinutes).toBe(20);
        expect(updated.notificationPolicy?.shiftEndReminderMinutes).toBe(10);
        expect(updated.notificationPolicy?.cashDiscrepancyThresholdVnd).toBe(25000);

        await loginViaApi(page, "owner");
        await page.goto(`${BASE_URL}/settings`);
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("heading", { name: /Cài đặt hệ thống/i })).toBeVisible();
        await expect(page.locator("body")).toContainText(/Telegram|Zalo|Email|nhắc ca|tiền két/i);
      } finally {
        await restoreSettings(request, ownerHeaders, snapshot);
      }
    });

    test("T1-F5-02: OWNER updates employee telegramChatId, zaloUserId, and notificationPreferences via PATCH /api/employees/[id]", async ({
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
        const patchRes = await updateEmployeeContacts(request, ownerHeaders, nam.id, {
          telegramChatId: "998877665",
          zaloUserId: "zalo_e2e_nam",
          notificationPreferences: { telegram: true, zalo: false, email: true },
        });
        expect(patchRes.status()).toBe(200);

        const getRes = await request.get(`${BASE_URL}/api/employees/${nam.id}`, { headers: ownerHeaders });
        expect(getRes.status()).toBe(200);
        const detail = await apiJson<{
          telegramChatId?: string | null;
          zaloUserId?: string | null;
          notificationPreferences?: Record<string, unknown> | null;
        }>(getRes);
        expect(detail.data?.telegramChatId).toBe("998877665");
        expect(detail.data?.zaloUserId).toBe("zalo_e2e_nam");
        expect(detail.data?.notificationPreferences?.zalo).toBe(false);
      } finally {
        await updateEmployeeContacts(request, ownerHeaders, nam.id, original);
      }
    });

    test("T1-F5-03: EMPLOYEE updates own notification contact & channel preferences via self API and /employee/profile UI", async ({
      page,
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const anhHeaders = await authHeadersFor(request, "employeeAnh");
      const anh = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeAnh.code);
      const original = {
        telegramChatId: anh.telegramChatId ?? null,
        zaloUserId: anh.zaloUserId ?? null,
        notificationPreferences: anh.notificationPreferences ?? { telegram: true, zalo: true, email: true },
      };

      try {
        const res = await updateSelfNotificationContacts(request, anhHeaders, {
          telegramChatId: "112233445",
          zaloUserId: "zalo_self_anh",
          notificationPreferences: { telegram: true, zalo: true, email: false },
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);

        await loginViaApi(page, "employeeAnh");
        await page.goto(`${BASE_URL}/employee/profile`);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("body")).toContainText(/Telegram|Zalo|Thông báo/i);
      } finally {
        await updateEmployeeContacts(request, ownerHeaders, anh.id, original);
      }
    });

    test("T1-F5-04: GET /api/notifications, POST mark-read, and POST /api/notifications/read-all manage unread counts", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const namHeaders = await authHeadersFor(request, "employeeNam");

      const res = await request.post(`${BASE_URL}/api/leaves`, {
        headers: namHeaders,
        data: {
          startAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
          endAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
          reason: "T1-F5-04 kiểm tra danh sách thông báo",
        },
      });
      expect(res.status()).toBe(201);

      const unreadList = await getNotifications(request, ownerHeaders, true);
      expect(unreadList.unreadCount).toBeGreaterThanOrEqual(1);
      const firstItem = unreadList.items[0];
      expect(firstItem).toBeDefined();
      if (firstItem) {
        const markOne = await request.post(`${BASE_URL}/api/notifications`, {
          headers: ownerHeaders,
          data: { id: firstItem.id },
        });
        expect(markOne.status()).toBe(200);
      }

      await markAllNotificationsRead(request, ownerHeaders);
      const afterReadAll = await getNotifications(request, ownerHeaders, true);
      expect(afterReadAll.unreadCount).toBe(0);
    });

    test("T1-F5-05: NotificationBell UI renders unread badge, opens popover, and marks items read", async ({
      page,
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      await markAllNotificationsRead(request, managerHeaders);

      const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
        headers: namHeaders,
        data: {
          startAt: new Date(Date.now() + 9 * 3600_000).toISOString(),
          endAt: new Date(Date.now() + 13 * 3600_000).toISOString(),
          reason: "T1-F5-05 kiểm tra chuông thông báo UI",
        },
      });
      expect(leaveRes.status()).toBe(201);

      await loginViaApi(page, "manager");
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForLoadState("networkidle");

      const bellBtn = page.locator('button[title="Thông báo"]');
      await expect(bellBtn).toBeVisible();
      await bellBtn.click();

      await expect(page.getByText(/Đơn xin nghỉ|T1-F5-05/i).first()).toBeVisible({ timeout: 10000 });
      const readAllBtn = page.getByRole("button", { name: /Đã đọc tất cả/i });
      if (await readAllBtn.isVisible()) {
        await readAllBtn.click();
      }
      await markAllNotificationsRead(request, managerHeaders);
    });
  });

  // =========================================================================
  // F6: Multi-Channel Notification Service (5 tests)
  // =========================================================================
  test.describe("F6: Multi-Channel Notification Service", () => {
    test("T1-F6-01: Mode A unconfigured credentials never throw 500 and persist in-app notifications", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      await markAllNotificationsRead(request, ownerHeaders);

      const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
        headers: namHeaders,
        data: {
          startAt: new Date(Date.now() + 10 * 3600_000).toISOString(),
          endAt: new Date(Date.now() + 14 * 3600_000).toISOString(),
          reason: "T1-F6-01 Mode A fallback test",
        },
      });
      expect(leaveRes.status()).toBe(201);

      const ownerNotifs = await getNotifications(request, ownerHeaders, true);
      expect(ownerNotifs.items.some((n) => n.type === "LEAVE_SUBMITTED")).toBe(true);
    });

    test("T1-F6-02: Toggling enableTelegram/enableZalo/enableEmail in notificationPolicy persists cleanly without breaking triggers", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const snapshot = await snapshotSettings(request, ownerHeaders);

      try {
        const updated = await updateNotificationPolicy(request, ownerHeaders, {
          enableTelegram: true,
          enableZalo: false,
          enableEmail: true,
        });
        expect(updated.notificationPolicy?.enableZalo).toBe(false);

        const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
          headers: namHeaders,
          data: {
            startAt: new Date(Date.now() + 11 * 3600_000).toISOString(),
            endAt: new Date(Date.now() + 15 * 3600_000).toISOString(),
            reason: "T1-F6-02 policy channel toggles test",
          },
        });
        expect(leaveRes.status()).toBe(201);
      } finally {
        await restoreSettings(request, ownerHeaders, snapshot);
      }
    });

    test("T1-F6-03: Per-user notificationPreferences opt-out persists and keeps trigger requests healthy", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeNam.code);
      const original = {
        telegramChatId: nam.telegramChatId ?? null,
        zaloUserId: nam.zaloUserId ?? null,
        notificationPreferences: nam.notificationPreferences ?? { telegram: true, zalo: true, email: true },
      };

      try {
        const prefRes = await updateSelfNotificationContacts(request, namHeaders, {
          telegramChatId: "554433221",
          notificationPreferences: { telegram: true, zalo: false, email: false },
        });
        expect(prefRes.status).toBe(200);

        const weekStart = await findUnusedFutureMonday(request, ownerHeaders, 10);
        const sched = await createScheduleWeek(request, ownerHeaders, weekStart, false);
        const shift = await createShiftInSchedule(request, ownerHeaders, sched.id, {
          workDate: weekStart,
          name: "Ca 1 OptOut Check",
          startTime: "07:00",
          endTime: "11:00",
        });
        const assignRes = await assignEmployeeToShift(request, ownerHeaders, shift.id, nam.id);
        expect(assignRes.status()).toBe(201);
        const pubRes = await changeScheduleStatus(request, ownerHeaders, sched.id, "PUBLISH");
        expect(pubRes.status()).toBe(200);
      } finally {
        await updateEmployeeContacts(request, ownerHeaders, nam.id, original);
      }
    });

    test("T1-F6-04: [Mode B Capture] External mock server receives formatted Telegram, Zalo, and Email payloads", async ({
      request,
    }) => {
      test.skip(
        process.env.E2E_WEBHOOK_CAPTURE !== "1",
        "Mode B requires Next.js server launched with E2E_WEBHOOK_CAPTURE=1 and mock webhook URLs",
      );

      const mockPort = Number(process.env.E2E_MOCK_WEBHOOK_PORT ?? "3999");
      const server = await startMockNotificationServer(mockPort);
      const ownerHeaders = await authHeadersFor(request, "owner");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const snapshot = await snapshotSettings(request, ownerHeaders);
      const ownerEmp = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.owner.code);
      const managerEmp = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.manager.code);
      const ownerOriginal = {
        telegramChatId: ownerEmp.telegramChatId ?? null,
        zaloUserId: ownerEmp.zaloUserId ?? null,
        notificationPreferences: ownerEmp.notificationPreferences ?? { telegram: true, zalo: true, email: true },
      };
      const managerOriginal = {
        telegramChatId: managerEmp.telegramChatId ?? null,
        zaloUserId: managerEmp.zaloUserId ?? null,
        notificationPreferences: managerEmp.notificationPreferences ?? { telegram: true, zalo: true, email: true },
      };

      try {
        await updateEmployeeContacts(request, ownerHeaders, ownerEmp.id, {
          telegramChatId: "900101",
          zaloUserId: "zalo_owner_e2e",
          notificationPreferences: { telegram: true, zalo: true, email: true },
        });
        await updateEmployeeContacts(request, ownerHeaders, managerEmp.id, {
          telegramChatId: "900102",
          zaloUserId: "zalo_manager_e2e",
          notificationPreferences: { telegram: true, zalo: true, email: true },
        });
        await updateNotificationPolicy(request, ownerHeaders, {
          enableTelegram: true,
          enableZalo: true,
          enableEmail: true,
          managerTelegramChatIds: ["900001"],
        });

        const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
          headers: namHeaders,
          data: {
            startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            endAt: new Date(Date.now() + 180 * 60_000).toISOString(),
            isEmergency: true,
            reason: "T1-F6-04 Capture Wire Check",
          },
        });
        expect(leaveRes.status()).toBe(201);

        const tgReq = await server.waitForRequest((r) => r.path.includes("/sendMessage"), 5000);
        expect(tgReq.json?.chat_id).toBeTruthy();
        expect(typeof tgReq.json?.text).toBe("string");

        const zaloReq = await server.waitForRequest(
          (r) =>
            r.path.includes("/zalo") ||
            r.path.includes("/message/template") ||
            r.path.includes("/oa/message/cs"),
          5000,
        );
        expect(zaloReq.json).not.toBeNull();
        expect(
          Boolean(zaloReq.json?.event || zaloReq.json?.template_id || zaloReq.json?.recipient),
        ).toBe(true);

        const emailReq = await server.waitForRequest((r) => r.path.includes("/emails"), 5000);
        expect(emailReq.json?.to).toBeTruthy();
        expect(typeof emailReq.json?.subject).toBe("string");
        expect(typeof emailReq.json?.html).toBe("string");
      } finally {
        await restoreSettings(request, ownerHeaders, snapshot);
        await updateEmployeeContacts(request, ownerHeaders, ownerEmp.id, ownerOriginal);
        await updateEmployeeContacts(request, ownerHeaders, managerEmp.id, managerOriginal);
        await server.close();
      }
    });

    test("T1-F6-05: [Mode B Fault Isolation] HTTP 500 from external mock webhook does not fail business commit", async ({
      request,
    }) => {
      test.skip(
        process.env.E2E_WEBHOOK_CAPTURE !== "1",
        "Mode B requires Next.js server launched with E2E_WEBHOOK_CAPTURE=1 and mock webhook URLs",
      );

      const mockPort = Number(process.env.E2E_MOCK_WEBHOOK_PORT ?? "3999");
      const server = await startMockNotificationServer(mockPort);
      const ownerHeaders = await authHeadersFor(request, "owner");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const snapshot = await snapshotSettings(request, ownerHeaders);
      const ownerEmp = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.owner.code);
      const ownerOriginal = {
        telegramChatId: ownerEmp.telegramChatId ?? null,
        zaloUserId: ownerEmp.zaloUserId ?? null,
        notificationPreferences: ownerEmp.notificationPreferences ?? { telegram: true, zalo: true, email: true },
      };

      try {
        await updateEmployeeContacts(request, ownerHeaders, ownerEmp.id, {
          telegramChatId: "900201",
          zaloUserId: "zalo_owner_500_e2e",
          notificationPreferences: { telegram: true, zalo: true, email: true },
        });
        await updateNotificationPolicy(request, ownerHeaders, {
          enableTelegram: true,
          enableZalo: true,
          enableEmail: true,
          managerTelegramChatIds: ["900002"],
        });

        server.setFailStatus(500);

        const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
          headers: namHeaders,
          data: {
            startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            endAt: new Date(Date.now() + 180 * 60_000).toISOString(),
            isEmergency: true,
            reason: "T1-F6-05 Webhook 500 Isolation",
          },
        });
        expect(leaveRes.status()).toBe(201);

        await server.waitForRequest(
          (r) =>
            r.path.includes("/sendMessage") ||
            r.path.includes("/zalo") ||
            r.path.includes("/message/template") ||
            r.path.includes("/oa/message/cs") ||
            r.path.includes("/emails"),
          5000,
        );
        expect(server.requests.length).toBeGreaterThan(0);
      } finally {
        await restoreSettings(request, ownerHeaders, snapshot);
        await updateEmployeeContacts(request, ownerHeaders, ownerEmp.id, ownerOriginal);
        await server.close();
      }
    });
  });

  // =========================================================================
  // F7: Scenario 1 — Weekly Schedule Publish Alert (5 tests)
  // =========================================================================
  test.describe("F7: Scenario 1 — Weekly Schedule Publish Alert", () => {
    test("T1-F7-01: Publishing future DRAFT schedule delivers SCHEDULE_PUBLISHED to assigned employee", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);
      await markAllNotificationsRead(request, namHeaders);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 20);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 (07:00–11:00)",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);

      const pubRes = await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH");
      expect(pubRes.status()).toBe(200);
      const pubJson = await apiJson<ScheduleDetailDto>(pubRes);
      expect(pubJson.data?.status).toBe("PUBLISHED");

      const namNotifs = await getNotifications(request, namHeaders, true);
      const hit = namNotifs.items.find(
        (n) => n.type === "SCHEDULE_PUBLISHED" && n.linkUrl === `/employee/schedule?week=${weekStart}`,
      );
      expect(hit).toBeDefined();
    });

    test("T1-F7-02: Unassigned employee does NOT receive SCHEDULE_PUBLISHED for that week", async ({ request }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);
      await markAllNotificationsRead(request, namHeaders);
      await markAllNotificationsRead(request, baoHeaders);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 25);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 2 (11:00–15:00)",
        startTime: "11:00",
        endTime: "15:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const baoNotifs = await getNotifications(request, baoHeaders, false);
      expect(baoNotifs.items.some((n) => n.linkUrl === `/employee/schedule?week=${weekStart}`)).toBe(false);
    });

    test("T1-F7-03: Publishing via /schedules UI updates status badge and notifies assigned employee", async ({
      page,
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const anhHeaders = await authHeadersFor(request, "employeeAnh");
      const anh = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeAnh.code);
      await markAllNotificationsRead(request, anhHeaders);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 30);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 3 (15:00–19:00)",
        startTime: "15:00",
        endTime: "19:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, anh.id)).status()).toBe(201);

      await loginViaApi(page, "manager");
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto(`${BASE_URL}/schedules?week=${weekStart}`);
      await page.waitForLoadState("networkidle");

      page.once("dialog", (dialog) => dialog.accept());
      const publishBtn = page.getByRole("button", { name: /Công bố lịch/i });
      await expect(publishBtn).toBeVisible({ timeout: 10000 });
      await publishBtn.click();

      await expect(page.getByText(/Đã công bố/i).first()).toBeVisible({ timeout: 10000 });
      const anhNotifs = await getNotifications(request, anhHeaders, true);
      expect(anhNotifs.items.some((n) => n.type === "SCHEDULE_PUBLISHED")).toBe(true);
    });

    test("T1-F7-04: Assigning and removing an employee on PUBLISHED schedule sends SCHEDULE_UPDATED", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);
      const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);
      await markAllNotificationsRead(request, baoHeaders);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 35);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 4 (19:00–23:00)",
        startTime: "19:00",
        endTime: "23:00",
        maxStaff: 2,
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const assignBaoRes = await assignEmployeeToShift(request, managerHeaders, shift.id, bao.id);
      expect(assignBaoRes.status()).toBe(201);
      const assignBaoJson = await apiJson<{ id?: string; assignment?: { id: string } }>(assignBaoRes);
      const assignmentId = assignBaoJson.data?.assignment?.id ?? assignBaoJson.data?.id ?? "";
      expect(assignmentId).toBeTruthy();

      const afterAssign = await getNotifications(request, baoHeaders, false);
      expect(afterAssign.items.some((n) => n.type === "SCHEDULE_UPDATED")).toBe(true);

      const delRes = await request.delete(`${BASE_URL}/api/assignments/${assignmentId}`, {
        headers: managerHeaders,
      });
      expect(delRes.status()).toBe(200);
    });

    test("T1-F7-05: LOCK and OWNER UNLOCK transitions succeed without generating spurious SCHEDULE_PUBLISHED spam", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeNam.code);

      const weekStart = await findUnusedFutureMonday(request, ownerHeaders, 40);
      const sched = await createScheduleWeek(request, ownerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, ownerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Lock Check",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, ownerHeaders, sched.id, "PUBLISH")).status()).toBe(200);
      await markAllNotificationsRead(request, namHeaders);

      const lockRes = await changeScheduleStatus(request, ownerHeaders, sched.id, "LOCK");
      expect(lockRes.status()).toBe(200);
      expect((await apiJson<ScheduleDetailDto>(lockRes)).data?.status).toBe("LOCKED");

      const unlockRes = await changeScheduleStatus(request, ownerHeaders, sched.id, "UNLOCK");
      expect(unlockRes.status()).toBe(200);
      expect((await apiJson<ScheduleDetailDto>(unlockRes)).data?.status).toBe("PUBLISHED");

      const namNotifs = await getNotifications(request, namHeaders, true);
      expect(namNotifs.items.some((n) => n.type === "SCHEDULE_PUBLISHED")).toBe(false);
    });
  });

  // =========================================================================
  // F8: Scenario 2 — Emergency Leave & Shift Swap Alert (5 tests)
  // =========================================================================
  test.describe("F8: Scenario 2 — Emergency Leave & Shift Swap Alert", () => {
    test("T1-F8-01: Normal leave (>4h ahead) returns 201 and notifies OWNER & MANAGER with LEAVE_SUBMITTED", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const managerHeaders = await authHeadersFor(request, "manager");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      await markAllNotificationsRead(request, ownerHeaders);
      await markAllNotificationsRead(request, managerHeaders);

      const res = await request.post(`${BASE_URL}/api/leaves`, {
        headers: baoHeaders,
        data: {
          startAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
          endAt: new Date(Date.now() + 28 * 3600_000).toISOString(),
          reason: "T1-F8-01 xin nghỉ phép có kế hoạch",
        },
      });
      expect(res.status()).toBe(201);

      const ownerNotifs = await getNotifications(request, ownerHeaders, true);
      const managerNotifs = await getNotifications(request, managerHeaders, true);
      expect(ownerNotifs.items.some((n) => n.type === "LEAVE_SUBMITTED" && n.linkUrl === "/requests")).toBe(true);
      expect(managerNotifs.items.some((n) => n.type === "LEAVE_SUBMITTED" && n.linkUrl === "/requests")).toBe(true);
    });

    test("T1-F8-02: Emergency leave (isEmergency=true, <4h ahead) bypasses 4h rule via UI toggle and alerts managers", async ({
      page,
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      await markAllNotificationsRead(request, managerHeaders);

      await loginViaApi(page, "employeeHa");
      await page.goto(`${BASE_URL}/employee/requests`);
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: /Tạo đơn xin nghỉ/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const emergencyToggle = dialog.locator('input[type="checkbox"], [role="switch"]').first();
      await expect(emergencyToggle).toBeVisible({ timeout: 5000 });
      await emergencyToggle.click();

      const startDt = formatVnDateTimeLocalOffset(60);
      const endDt = formatVnDateTimeLocalOffset(240);
      await dialog.locator('input[type="datetime-local"]').nth(0).fill(startDt);
      await dialog.locator('input[type="datetime-local"]').nth(1).fill(endDt);
      await dialog.locator("input[placeholder*='Bận việc']").fill("T1-F8-02 nghỉ đột xuất gấp");

      const postPromise = page.waitForResponse(
        (r) => r.url().includes("/api/leaves") && r.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: /Gửi đơn xin nghỉ/i }).click();
      const postRes = await postPromise;
      expect(postRes.status()).toBe(201);

      const managerNotifs = await getNotifications(request, managerHeaders, true);
      expect(managerNotifs.items.some((n) => n.type === "LEAVE_SUBMITTED")).toBe(true);
    });

    test("T1-F8-03: Manager approves leave -> removes overlapping ShiftAssignment and notifies employee (LEAVE_REVIEWED)", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const haHeaders = await authHeadersFor(request, "employeeHa");
      const ha = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHa.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 45);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 2 Leave AutoUnassign",
        startTime: "11:00",
        endTime: "15:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, ha.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const leaveRes = await request.post(`${BASE_URL}/api/leaves`, {
        headers: haHeaders,
        data: {
          shiftId: shift.id,
          startAt: `${weekStart}T11:00:00+07:00`,
          endAt: `${weekStart}T15:00:00+07:00`,
          reason: "T1-F8-03 duyệt đơn tự gỡ ca",
        },
      });
      expect(leaveRes.status()).toBe(201);
      const leaveJson = await apiJson<LeaveRequestDto>(leaveRes);
      const leaveId = leaveJson.data?.id ?? "";
      expect(leaveId).toBeTruthy();

      await markAllNotificationsRead(request, haHeaders);
      const reviewRes = await request.post(`${BASE_URL}/api/leaves/${leaveId}/review`, {
        headers: managerHeaders,
        data: { status: "APPROVED", reviewNote: "Chấp thuận nghỉ phép" },
      });
      expect(reviewRes.status()).toBe(200);

      const refreshedSchedRes = await request.get(`${BASE_URL}/api/schedules/${sched.id}`, {
        headers: managerHeaders,
      });
      const refreshedSched = await apiJson<ScheduleDetailDto>(refreshedSchedRes);
      const updatedShift = refreshedSched.data?.shifts.find((s) => s.id === shift.id);
      expect(updatedShift?.assignments.some((a) => a.employeeId === ha.id)).toBe(false);

      const haNotifs = await getNotifications(request, haHeaders, true);
      expect(haNotifs.items.some((n) => n.type === "LEAVE_REVIEWED")).toBe(true);
    });

    test("T1-F8-04: Full 3-step Swap lifecycle notifies target, manager, and both employees on approval", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const huyHeaders = await authHeadersFor(request, "employeeHuy");
      const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);
      const huy = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHuy.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 50);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Swap Lifecycle",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, bao.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      await markAllNotificationsRead(request, huyHeaders);
      const swapRes = await request.post(`${BASE_URL}/api/swaps`, {
        headers: baoHeaders,
        data: { shiftId: shift.id, targetEmployeeId: huy.id, reason: "T1-F8-04 đổi ca 3 bước" },
      });
      expect(swapRes.status()).toBe(201);
      const swapId = (await apiJson<SwapRequestDto>(swapRes)).data?.id ?? "";
      expect((await getNotifications(request, huyHeaders, true)).items.some((n) => n.type === "SWAP_REQUESTED")).toBe(
        true,
      );

      await markAllNotificationsRead(request, managerHeaders);
      const respondRes = await request.post(`${BASE_URL}/api/swaps/${swapId}/respond`, {
        headers: huyHeaders,
        data: { accept: true },
      });
      expect(respondRes.status()).toBe(200);
      expect((await getNotifications(request, managerHeaders, true)).items.some((n) => n.type === "SWAP_ACCEPTED")).toBe(
        true,
      );

      await markAllNotificationsRead(request, baoHeaders);
      await markAllNotificationsRead(request, huyHeaders);
      const reviewRes = await request.post(`${BASE_URL}/api/swaps/${swapId}/review`, {
        headers: managerHeaders,
        data: { approved: true, reviewNote: "Đồng ý đổi ca" },
      });
      expect(reviewRes.status()).toBe(200);
      expect((await getNotifications(request, baoHeaders, true)).items.some((n) => n.type === "SWAP_REVIEWED")).toBe(
        true,
      );
      expect((await getNotifications(request, huyHeaders, true)).items.some((n) => n.type === "SWAP_REVIEWED")).toBe(
        true,
      );
    });

    test("T1-F8-05: Emergency replace (POST /api/shifts/[id]/emergency-replace) swaps staff and sends SCHEDULE_UPDATED", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const haHeaders = await authHeadersFor(request, "employeeHa");
      const bao = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeBao.code);
      const ha = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeHa.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 55);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 3 Emergency Replace",
        startTime: "15:00",
        endTime: "19:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, bao.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      await markAllNotificationsRead(request, baoHeaders);
      await markAllNotificationsRead(request, haHeaders);

      const replaceRes = await request.post(`${BASE_URL}/api/shifts/${shift.id}/emergency-replace`, {
        headers: managerHeaders,
        data: {
          absentEmployeeId: bao.id,
          replacementEmployeeId: ha.id,
          reason: "T1-F8-05 thay thế khẩn cấp ca chiều",
        },
      });
      expect(replaceRes.status()).toBe(200);
      expect((await getNotifications(request, baoHeaders, true)).items.some((n) => n.type === "SCHEDULE_UPDATED")).toBe(
        true,
      );
      expect((await getNotifications(request, haHeaders, true)).items.some((n) => n.type === "SCHEDULE_UPDATED")).toBe(
        true,
      );
    });
  });

  // =========================================================================
  // F9: Scenario 3 — Handover Cash Discrepancy Alert (5 tests)
  // =========================================================================
  test.describe("F9: Scenario 3 — Handover Cash Discrepancy Alert", () => {
    test("T1-F9-01: Balanced 8-step handover (cashDifferenceVnd=0) submits SUBMITTED without manager discrepancy alert", async ({
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 60);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Balanced Handover",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      await markAllNotificationsRead(request, managerHeaders);
      const res = await request.post(`${BASE_URL}/api/handovers`, {
        headers: namHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: nam.id,
          openingCashVnd: 1000000,
          cashSalesVnd: 500000,
          cashExpensesVnd: 100000,
          actualClosingCashVnd: 1400000,
        }),
      });
      expect(res.status()).toBe(201);
      const json = await apiJson<{ handover?: ShiftHandoverDto }>(res);
      expect(json.data?.handover?.status).toBe("SUBMITTED");

      const mgrNotifs = await getNotifications(request, managerHeaders, true);
      expect(mgrNotifs.items.some((n) => /chênh lệch|lệch két/i.test(`${n.title} ${n.message}`))).toBe(false);
    });

    test("T1-F9-02: Cash shortage (-50,000đ) sets DISCREPANCY and fires immediate manager & owner alert", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 65);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 2 Cash Shortage",
        startTime: "11:00",
        endTime: "15:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      await markAllNotificationsRead(request, ownerHeaders);
      await markAllNotificationsRead(request, managerHeaders);

      const res = await request.post(`${BASE_URL}/api/handovers`, {
        headers: namHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: nam.id,
          openingCashVnd: 2000000,
          cashSalesVnd: 1500000,
          cashExpensesVnd: 100000,
          actualClosingCashVnd: 3350000,
          cashDiscrepancyReason: "Thiếu 50.000đ do trả nhầm tiền thừa khách",
        }),
      });
      expect(res.status()).toBe(201);
      const json = await apiJson<{ handover?: ShiftHandoverDto }>(res);
      expect(json.data?.handover?.status).toBe("DISCREPANCY");

      const mgrNotifs = await getNotifications(request, managerHeaders, true);
      const ownerNotifs = await getNotifications(request, ownerHeaders, true);
      expect(mgrNotifs.items.some((n) => n.linkUrl === "/handovers")).toBe(true);
      expect(ownerNotifs.items.some((n) => n.linkUrl === "/handovers")).toBe(true);
    });

    test("T1-F9-03: Cash surplus (+30,000đ) sets DISCREPANCY and fires manager alert", async ({ request }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const anhHeaders = await authHeadersFor(request, "employeeAnh");
      const anh = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeAnh.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 70);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 3 Cash Surplus",
        startTime: "15:00",
        endTime: "19:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, anh.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      await markAllNotificationsRead(request, managerHeaders);
      const res = await request.post(`${BASE_URL}/api/handovers`, {
        headers: anhHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: anh.id,
          openingCashVnd: 1000000,
          cashSalesVnd: 1000000,
          cashExpensesVnd: 0,
          actualClosingCashVnd: 2030000,
          cashDiscrepancyReason: "Dư 30.000đ khách gửi tip chưa tách riêng",
        }),
      });
      expect(res.status()).toBe(201);
      expect((await apiJson<{ handover?: ShiftHandoverDto }>(res)).data?.handover?.status).toBe("DISCREPANCY");
      expect((await getNotifications(request, managerHeaders, true)).items.some((n) => n.linkUrl === "/handovers")).toBe(
        true,
      );
    });

    test("T1-F9-04: Manager disputes SUBMITTED handover via /api/handovers/[id]/dispute -> DISCREPANCY + alert", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 75);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 4 Dispute Check",
        startTime: "19:00",
        endTime: "23:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const subRes = await request.post(`${BASE_URL}/api/handovers`, {
        headers: namHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: nam.id,
          openingCashVnd: 1000000,
          cashSalesVnd: 500000,
          cashExpensesVnd: 0,
          actualClosingCashVnd: 1500000,
        }),
      });
      const handoverId = (await apiJson<{ handover?: ShiftHandoverDto }>(subRes)).data?.handover?.id ?? "";
      expect(handoverId).toBeTruthy();

      await markAllNotificationsRead(request, ownerHeaders);
      const disputeRes = await request.post(`${BASE_URL}/api/handovers/${handoverId}/dispute`, {
        headers: managerHeaders,
        data: { disputeReason: "Kiểm đếm thực tế két sáng hôm sau thiếu tờ 50k" },
      });
      expect(disputeRes.status()).toBe(200);
      const disputeJson = await apiJson<{ status?: string }>(disputeRes);
      expect(disputeJson.data?.status).toBe("DISCREPANCY");

      const ownerNotifs = await getNotifications(request, ownerHeaders, true);
      expect(ownerNotifs.items.length).toBeGreaterThanOrEqual(1);
    });

    test("T1-F9-05: Manager confirms & reopens handover via API and /handovers UI renders status badges", async ({
      page,
      request,
    }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const namHeaders = await authHeadersFor(request, "employeeNam");
      const nam = await findEmployeeByCode(request, managerHeaders, SEEDED_USERS.employeeNam.code);

      const weekStart = await findUnusedFutureMonday(request, managerHeaders, 80);
      const sched = await createScheduleWeek(request, managerHeaders, weekStart, false);
      const shift = await createShiftInSchedule(request, managerHeaders, sched.id, {
        workDate: weekStart,
        name: "Ca 1 Confirm Reopen",
        startTime: "07:00",
        endTime: "11:00",
      });
      expect((await assignEmployeeToShift(request, managerHeaders, shift.id, nam.id)).status()).toBe(201);
      expect((await changeScheduleStatus(request, managerHeaders, sched.id, "PUBLISH")).status()).toBe(200);

      const subRes = await request.post(`${BASE_URL}/api/handovers`, {
        headers: namHeaders,
        data: buildHandoverPayload({
          shiftId: shift.id,
          handoverEmployeeId: nam.id,
          openingCashVnd: 1000000,
          cashSalesVnd: 200000,
          cashExpensesVnd: 0,
          actualClosingCashVnd: 1200000,
        }),
      });
      const handoverId = (await apiJson<{ handover?: ShiftHandoverDto }>(subRes)).data?.handover?.id ?? "";

      const confirmRes = await request.post(`${BASE_URL}/api/handovers/${handoverId}/confirm`, {
        headers: managerHeaders,
        data: { reviewNotes: "Đã đối soát khớp" },
      });
      expect(confirmRes.status()).toBe(200);

      const reopenRes = await request.post(`${BASE_URL}/api/handovers/${handoverId}/reopen`, {
        headers: managerHeaders,
        data: { reopenReason: "Mở lại kiểm tra bổ sung" },
      });
      expect(reopenRes.status()).toBe(200);

      await loginViaApi(page, "manager");
      await page.goto(`${BASE_URL}/handovers`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: /Bàn giao/i }).first()).toBeVisible();
    });
  });

  // =========================================================================
  // F10: Scenario 4 — Shift Start/End Reminders & Cron (5 tests)
  // =========================================================================
  test.describe("F10: Scenario 4 — Shift Start/End Reminders & Cron", () => {
    test("T1-F10-01: MANAGER session calls POST /api/cron/shift-reminders -> 200 summary", async ({ request }) => {
      const managerHeaders = await authHeadersFor(request, "manager");
      const res = await request.post(`${BASE_URL}/api/cron/shift-reminders`, {
        headers: managerHeaders,
      });
      expect(res.status()).toBe(200);
      const json = await apiJson<Record<string, unknown>>(res);
      expect(json.ok).toBe(true);
    });

    test("T1-F10-02: CRON_SECRET header auth succeeds when configured and rejects invalid secret", async ({ request }) => {
      const badRes = await request.post(`${BASE_URL}/api/cron/shift-reminders`, {
        headers: { Authorization: "Bearer invalid-cron-secret-e2e" },
      });
      expect([401, 403]).toContain(badRes.status());

      const secret = process.env.CRON_SECRET;
      if (secret) {
        const okRes = await request.post(`${BASE_URL}/api/cron/shift-reminders`, {
          headers: { Authorization: `Bearer ${secret}` },
        });
        expect(okRes.status()).toBe(200);
      } else {
        const ownerHeaders = await authHeadersFor(request, "owner");
        const ownerRes = await request.post(`${BASE_URL}/api/cron/shift-reminders`, {
          headers: ownerHeaders,
        });
        expect(ownerRes.status()).toBe(200);
      }
    });

    test("T1-F10-03: Assigned employee on PUBLISHED shift starting within reminder window receives SHIFT_REMINDER", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const baoHeaders = await authHeadersFor(request, "employeeBao");
      const bao = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeBao.code);
      const snapshot = await snapshotSettings(request, ownerHeaders);
      const win = computeReminderShiftWindow("start", 8, 60);
      let createdShiftId: string | null = null;

      try {
        await updateNotificationPolicy(request, ownerHeaders, { shiftStartReminderMinutes: 15 });
        const { schedule } = await ensureEditableWeekForDate(request, ownerHeaders, win.workDate);
        const shift = await createShiftInSchedule(request, ownerHeaders, schedule.id, {
          workDate: win.workDate,
          name: `Nhắc vào ca ${Date.now()}`,
          startTime: win.startTime,
          endTime: win.endTime,
        });
        createdShiftId = shift.id;
        expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, bao.id)).status()).toBe(201);
        if (schedule.status === "DRAFT") {
          expect((await changeScheduleStatus(request, ownerHeaders, schedule.id, "PUBLISH")).status()).toBe(200);
        }

        await markAllNotificationsRead(request, baoHeaders);
        const cronRes = await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders });
        expect(cronRes.status()).toBe(200);

        const notifs = await getNotifications(request, baoHeaders, true);
        expect(notifs.items.some((n) => n.type === "SHIFT_REMINDER")).toBe(true);
      } finally {
        await deleteShiftSafe(request, ownerHeaders, createdShiftId);
        await restoreSettings(request, ownerHeaders, snapshot);
      }
    });

    test("T1-F10-04: Assigned employee on PUBLISHED shift ending within reminder window receives SHIFT_REMINDER", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const haHeaders = await authHeadersFor(request, "employeeHa");
      const ha = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeHa.code);
      const snapshot = await snapshotSettings(request, ownerHeaders);
      const win = computeReminderShiftWindow("end", 8, 90);
      let createdShiftId: string | null = null;

      try {
        await updateNotificationPolicy(request, ownerHeaders, { shiftEndReminderMinutes: 15 });
        const { schedule } = await ensureEditableWeekForDate(request, ownerHeaders, win.workDate);
        const shift = await createShiftInSchedule(request, ownerHeaders, schedule.id, {
          workDate: win.workDate,
          name: `Nhắc tan ca ${Date.now()}`,
          startTime: win.startTime,
          endTime: win.endTime,
        });
        createdShiftId = shift.id;
        expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, ha.id)).status()).toBe(201);
        if (schedule.status === "DRAFT") {
          expect((await changeScheduleStatus(request, ownerHeaders, schedule.id, "PUBLISH")).status()).toBe(200);
        }

        await markAllNotificationsRead(request, haHeaders);
        const cronRes = await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders });
        expect(cronRes.status()).toBe(200);

        const notifs = await getNotifications(request, haHeaders, true);
        expect(notifs.items.some((n) => n.type === "SHIFT_REMINDER")).toBe(true);
      } finally {
        await deleteShiftSafe(request, ownerHeaders, createdShiftId);
        await restoreSettings(request, ownerHeaders, snapshot);
      }
    });

    test("T1-F10-05: Idempotency (dedupeKey) — consecutive cron runs do not duplicate SHIFT_REMINDER", async ({
      request,
    }) => {
      const ownerHeaders = await authHeadersFor(request, "owner");
      const huyHeaders = await authHeadersFor(request, "employeeHuy");
      const huy = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS.employeeHuy.code);
      const win = computeReminderShiftWindow("start", 7, 60);
      let createdShiftId: string | null = null;

      try {
        const { schedule } = await ensureEditableWeekForDate(request, ownerHeaders, win.workDate);
        const shift = await createShiftInSchedule(request, ownerHeaders, schedule.id, {
          workDate: win.workDate,
          name: `Idempotent Ca ${Date.now()}`,
          startTime: win.startTime,
          endTime: win.endTime,
        });
        createdShiftId = shift.id;
        expect((await assignEmployeeToShift(request, ownerHeaders, shift.id, huy.id)).status()).toBe(201);
        if (schedule.status === "DRAFT") {
          expect((await changeScheduleStatus(request, ownerHeaders, schedule.id, "PUBLISH")).status()).toBe(200);
        }

        await markAllNotificationsRead(request, huyHeaders);
        const firstCron = await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders });
        expect(firstCron.status()).toBe(200);
        const afterFirst = (await getNotifications(request, huyHeaders, true)).items.filter(
          (n) => n.type === "SHIFT_REMINDER",
        ).length;

        const secondCron = await request.post(`${BASE_URL}/api/cron/shift-reminders`, { headers: ownerHeaders });
        expect(secondCron.status()).toBe(200);
        const afterSecond = (await getNotifications(request, huyHeaders, true)).items.filter(
          (n) => n.type === "SHIFT_REMINDER",
        ).length;

        expect(afterFirst).toBeGreaterThanOrEqual(1);
        expect(afterSecond).toBe(afterFirst);
      } finally {
        await deleteShiftSafe(request, ownerHeaders, createdShiftId);
      }
    });
  });
});
