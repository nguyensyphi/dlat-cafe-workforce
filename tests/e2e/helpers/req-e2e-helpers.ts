import http from "node:http";
import { expect, type APIRequestContext, type APIResponse, type Cookie, type Locator, type Page } from "@playwright/test";

export const BASE_URL = "http://localhost:3005";
export const SESSION_COOKIE_NAME = "cafe_wf_session";

export const MOBILE_VIEWPORTS = {
  sm375: { width: 375, height: 812 },
  md390: { width: 390, height: 844 },
} as const;

export interface SeededUserInfo {
  code: string;
  fullName: string;
  email: string;
  password: string;
  role: "OWNER" | "MANAGER" | "EMPLOYEE";
  status: "ACTIVE" | "INACTIVE";
  phone: string;
  pin: string;
  primaryPositionCode: string;
}

export const SEEDED_USERS = {
  owner: {
    code: "NV001",
    fullName: "Nguyễn Minh Khôi",
    email: "owner@dlatcafe.vn",
    password: "Admin@123",
    role: "OWNER",
    status: "ACTIVE",
    phone: "0903111222",
    pin: "1222",
    primaryPositionCode: "QUAN_LY",
  },
  manager: {
    code: "NV002",
    fullName: "Trần Thanh Thảo",
    email: "manager@dlatcafe.vn",
    password: "Admin@123",
    role: "MANAGER",
    status: "ACTIVE",
    phone: "0903222333",
    pin: "2333",
    primaryPositionCode: "QUAN_LY",
  },
  employeeNam: {
    code: "NV003",
    fullName: "Lê Hoàng Nam",
    email: "nam.le@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0912333444",
    pin: "3444",
    primaryPositionCode: "TRUONG_CA",
  },
  employeeAnh: {
    code: "NV004",
    fullName: "Phạm Ngọc Ánh",
    email: "anh.pham@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0912444555",
    pin: "4555",
    primaryPositionCode: "TRUONG_CA",
  },
  employeeBao: {
    code: "NV005",
    fullName: "Võ Quốc Bảo",
    email: "bao.vo@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0915555666",
    pin: "5666",
    primaryPositionCode: "PHA_CHE",
  },
  employeeHa: {
    code: "NV006",
    fullName: "Đặng Thu Hà",
    email: "ha.dang@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0916666777",
    pin: "6777",
    primaryPositionCode: "PHA_CHE",
  },
  employeeHuy: {
    code: "NV007",
    fullName: "Hoàng Gia Huy",
    email: "huy.hoang@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0917777888",
    pin: "7888",
    primaryPositionCode: "PHA_CHE",
  },
  employeeLinh: {
    code: "NV008",
    fullName: "Bùi Khánh Linh",
    email: "linh.bui@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0918888999",
    pin: "8999",
    primaryPositionCode: "THU_NGAN",
  },
  employeeKiet: {
    code: "NV009",
    fullName: "Ngô Tuấn Kiệt",
    email: "kiet.ngo@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0932111333",
    pin: "1333",
    primaryPositionCode: "PHUC_VU",
  },
  employeeNhi: {
    code: "NV010",
    fullName: "Đỗ Phương Nhi",
    email: "nhi.do@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0932444666",
    pin: "4666",
    primaryPositionCode: "PHUC_VU",
  },
  employeeQuan: {
    code: "NV011",
    fullName: "Trương Minh Quân",
    email: "quan.truong@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0933555777",
    pin: "5777",
    primaryPositionCode: "PHUC_VU",
  },
  employeeChau: {
    code: "NV012",
    fullName: "Phan Bảo Châu",
    email: "chau.phan@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0934666888",
    pin: "6888",
    primaryPositionCode: "PHUC_VU",
  },
  employeeTam: {
    code: "NV013",
    fullName: "Huỳnh Văn Tâm",
    email: "tam.huynh@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "ACTIVE",
    phone: "0935777999",
    pin: "7999",
    primaryPositionCode: "VE_SINH",
  },
  inactiveDuyen: {
    code: "NV014",
    fullName: "Lý Mỹ Duyên",
    email: "duyen.ly@dlatcafe.vn",
    password: "Staff@123",
    role: "EMPLOYEE",
    status: "INACTIVE",
    phone: "0936888000",
    pin: "8000",
    primaryPositionCode: "PHUC_VU",
  },
} as const satisfies Record<string, SeededUserInfo>;

export type SeededUserKey = keyof typeof SEEDED_USERS;

export interface ShiftTemplateInfo {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  minStaff: number;
  maxStaff: number;
  isPeak: boolean;
}

export const SEEDED_SHIFT_TEMPLATES: readonly ShiftTemplateInfo[] = [
  { code: "CA_1", name: "Ca 1 (07:00–11:00)", startTime: "07:00", endTime: "11:00", minStaff: 1, maxStaff: 2, isPeak: false },
  { code: "CA_2", name: "Ca 2 (11:00–15:00)", startTime: "11:00", endTime: "15:00", minStaff: 1, maxStaff: 2, isPeak: false },
  { code: "CA_3", name: "Ca 3 (15:00–19:00)", startTime: "15:00", endTime: "19:00", minStaff: 1, maxStaff: 2, isPeak: false },
  { code: "CA_4", name: "Ca 4 (19:00–23:00)", startTime: "19:00", endTime: "23:00", minStaff: 1, maxStaff: 2, isPeak: true },
] as const;

export interface NotificationPreferences {
  telegram?: boolean;
  zalo?: boolean;
  email?: boolean;
  inApp?: boolean;
  [key: string]: unknown;
}

export interface NotificationPolicy {
  enableTelegram: boolean;
  enableZalo: boolean;
  enableEmail: boolean;
  managerTelegramChatIds: string[];
  groupTelegramChatId?: string | null;
  shiftStartReminderMinutes: number;
  shiftEndReminderMinutes: number;
  cashDiscrepancyThresholdVnd: number;
  [key: string]: unknown;
}

export interface SystemSettingsBundle {
  shopProfile: Record<string, unknown>;
  schedulingPolicy: Record<string, unknown>;
  attendancePolicy: Record<string, unknown>;
  payrollPolicy: Record<string, unknown>;
  notificationPolicy?: NotificationPolicy;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface NotificationItemDto {
  id: string;
  title: string;
  message: string;
  type: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListDto {
  unreadCount: number;
  items: NotificationItemDto[];
}

export interface PositionDto {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
}

export interface EmployeeSummaryDto {
  id: string;
  userId: string;
  employeeCode: string;
  fullName: string;
  phone: string;
  email: string;
  role: "OWNER" | "MANAGER" | "EMPLOYEE";
  status: "ACTIVE" | "INACTIVE";
  primaryPosition: {
    id: string;
    code: string;
    name: string;
  };
  telegramChatId?: string | null;
  zaloUserId?: string | null;
  notificationPreferences?: NotificationPreferences | null;
}

export interface ScheduleAssignmentDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  positionId: string;
  positionName: string;
}

export interface ScheduleShiftDto {
  id: string;
  scheduleId: string;
  templateId: string | null;
  name: string;
  workDate: string;
  startAt: string;
  endAt: string;
  startTime: string;
  endTime: string;
  requiredStaff: number;
  maxStaff: number | null;
  status: string;
  assignments: ScheduleAssignmentDto[];
}

export interface ScheduleDetailDto {
  id: string;
  weekStart: string;
  weekEnd: string;
  name: string | null;
  status: "DRAFT" | "PUBLISHED" | "LOCKED" | "ARCHIVED";
  shifts: ScheduleShiftDto[];
}

export interface LeaveRequestDto {
  id: string;
  employeeId: string;
  startAt?: string;
  endAt?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  isEmergency?: boolean;
  reason: string;
}

export interface SwapRequestDto {
  id: string;
  shiftId: string;
  requesterEmployeeId: string;
  targetEmployeeId: string;
  status: "PENDING" | "ACCEPTED" | "APPROVED" | "REJECTED" | "CANCELLED";
}

export interface ShiftHandoverDto {
  id: string;
  shiftId: string;
  status: "SUBMITTED" | "DISCREPANCY" | "CONFIRMED";
  cashDifferenceVnd?: string | number;
}

const cookieCache = new Map<string, Cookie[]>();
let loginIpSequence = 1;

function nextSyntheticIp(): string {
  loginIpSequence += 1;
  const third = Math.floor(loginIpSequence / 250) % 250;
  const fourth = (loginIpSequence % 250) + 1;
  return `10.25.${third}.${fourth}`;
}

export function resolveUserCreds(
  userKeyOrCreds: SeededUserKey | { email: string; password: string },
): { email: string; password: string } {
  if (typeof userKeyOrCreds === "string") {
    const found = SEEDED_USERS[userKeyOrCreds];
    return { email: found.email, password: found.password };
  }
  return userKeyOrCreds;
}

export async function apiJson<T>(res: { json(): Promise<unknown> }): Promise<ApiEnvelope<T>> {
  return (await res.json()) as ApiEnvelope<T>;
}

/**
 * Rate-limit-safe API login:
 * - Reuses cached session cookies per user across tests in this single worker.
 * - Uses a rotating synthetic `x-forwarded-for` header when hitting `/api/auth/login`.
 */
export async function loginViaApi(
  page: Page,
  userKeyOrCreds: SeededUserKey | { email: string; password: string },
  options: { bypassCache?: boolean } = {},
): Promise<{ email: string }> {
  const creds = resolveUserCreds(userKeyOrCreds);

  if (!options.bypassCache) {
    const cached = cookieCache.get(creds.email);
    if (cached && cached.length > 0) {
      await page.context().clearCookies();
      await page.context().addCookies(cached);
      return { email: creds.email };
    }
  }

  await page.context().clearCookies();
  const res = await page.request.post(`${BASE_URL}/api/auth/login`, {
    headers: {
      "x-forwarded-for": nextSyntheticIp(),
    },
    data: {
      email: creds.email,
      password: creds.password,
    },
  });

  if (!res.ok()) {
    const bodyText = await res.text();
    throw new Error(`API login failed for ${creds.email}: ${res.status()} ${bodyText}`);
  }

  const body = (await res.json()) as ApiEnvelope<{ user?: { email: string } }>;
  expect(body.ok).toBe(true);

  const cookies = await page.context().cookies(BASE_URL);
  const sessionCookies = cookies.filter((c) => c.name === SESSION_COOKIE_NAME);
  if (sessionCookies.length > 0) {
    cookieCache.set(creds.email, sessionCookies);
  }

  return { email: creds.email };
}

/**
 * Browser UI login (use sparingly to respect authRateLimiter on 127.0.0.1).
 */
export async function loginViaUi(
  page: Page,
  email: string,
  password: string,
  expectedUrlPattern?: RegExp,
): Promise<void> {
  await page.context().clearCookies();
  await page.goto(`${BASE_URL}/login`);
  await page.locator("#email").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /Đăng nhập/i }).click();
  if (expectedUrlPattern) {
    await page.waitForURL(expectedUrlPattern, { timeout: 15000 });
  }
  const cookies = await page.context().cookies(BASE_URL);
  const sessionCookies = cookies.filter((c) => c.name === SESSION_COOKIE_NAME);
  if (sessionCookies.length > 0) {
    cookieCache.set(email, sessionCookies);
  }
}

export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
}

export async function authHeadersFor(
  request: APIRequestContext,
  userKeyOrCreds: SeededUserKey | { email: string; password: string },
): Promise<Record<string, string>> {
  const creds = resolveUserCreds(userKeyOrCreds);
  let cookies = cookieCache.get(creds.email);

  if (!cookies || cookies.length === 0) {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      headers: {
        "x-forwarded-for": nextSyntheticIp(),
      },
      data: {
        email: creds.email,
        password: creds.password,
      },
    });
    if (!res.ok()) {
      throw new Error(`Auth header login failed for ${creds.email}: ${res.status()} ${await res.text()}`);
    }
    const setCookieHeaders = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
    for (const h of setCookieHeaders) {
      const firstPart = h.value.split(";")[0];
      if (!firstPart) continue;
      const eqIdx = firstPart.indexOf("=");
      if (eqIdx <= 0) continue;
      const name = firstPart.slice(0, eqIdx).trim();
      const value = firstPart.slice(eqIdx + 1).trim();
      if (name === SESSION_COOKIE_NAME) {
        cookies = [
          {
            name,
            value,
            domain: "localhost",
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
        ];
        cookieCache.set(creds.email, cookies);
      }
    }
  }

  const sessionCookie = cookies?.find((c) => c.name === SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    throw new Error(`Missing ${SESSION_COOKIE_NAME} cookie for ${creds.email}`);
  }
  return {
    cookie: `${sessionCookie.name}=${sessionCookie.value}`,
  };
}

export interface OverflowCheckResult {
  scrollWidth: number;
  clientWidth: number;
  offenders: Array<{ tag: string; text: string; right: number }>;
}

export async function assertNoHorizontalOverflow(page: Page, contextLabel = "page"): Promise<void> {
  const result = await page.evaluate((): OverflowCheckResult => {
    const doc = document.documentElement;
    const clientWidth = doc.clientWidth;
    const scrollWidth = doc.scrollWidth;
    const offenders: Array<{ tag: string; text: string; right: number }> = [];
    if (scrollWidth > clientWidth) {
      const all = Array.from(document.querySelectorAll("*"));
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > clientWidth + 1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent ?? "").trim().slice(0, 40),
            right: Math.round(rect.right),
          });
          if (offenders.length >= 5) break;
        }
      }
    }
    return { scrollWidth, clientWidth, offenders };
  });

  expect(
    result.scrollWidth,
    `${contextLabel}: horizontal overflow detected (${result.scrollWidth} > ${result.clientWidth}), offenders: ${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.clientWidth);
}

export async function assertTouchTargetsMinSize(
  targets: Locator[],
  minHeightPx = 44,
  minWidthPx = 44,
  label = "touch targets",
): Promise<void> {
  expect(targets.length, `${label}: expected at least 1 locator`).toBeGreaterThan(0);
  for (let i = 0; i < targets.length; i += 1) {
    const locator = targets[i];
    if (!locator) continue;
    await expect(locator, `${label}[${i}] must be visible`).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${label}[${i}] boundingBox must exist`).not.toBeNull();
    if (!box) continue;
    expect(box.height, `${label}[${i}] height (${box.height}px) < ${minHeightPx}px`).toBeGreaterThanOrEqual(minHeightPx);
    expect(box.width, `${label}[${i}] width (${box.width}px) < ${minWidthPx}px`).toBeGreaterThanOrEqual(minWidthPx);
  }
}

export async function assertSafeAreaSupport(page: Page): Promise<void> {
  const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewportMeta ?? "", "viewport meta must include viewport-fit=cover").toMatch(/viewport-fit=cover/i);

  const hasSafeAreaCss = await page.evaluate((): boolean => {
    const styleTags = Array.from(document.querySelectorAll("style"));
    for (const tag of styleTags) {
      if ((tag.textContent ?? "").includes("safe-area-inset")) {
        return true;
      }
    }
    const sheets = Array.from(document.styleSheets);
    for (const sheet of sheets) {
      try {
        const rules = Array.from(sheet.cssRules);
        for (const rule of rules) {
          if (rule.cssText.includes("safe-area-inset")) {
            return true;
          }
        }
      } catch {
        // Cross-origin stylesheet cannot be read
      }
    }
    const styledEls = Array.from(document.querySelectorAll("[style]"));
    for (const el of styledEls) {
      if ((el.getAttribute("style") ?? "").includes("safe-area-inset")) {
        return true;
      }
    }
    return false;
  });

  expect(hasSafeAreaCss, "Expected CSS rules using env(safe-area-inset-*)").toBe(true);
}

export async function waitForServiceWorkerReady(page: Page, timeoutMs = 15000): Promise<{
  state: string | null;
  scope: string;
  hasController: boolean;
}> {
  const supported = await page.evaluate(() => "serviceWorker" in navigator);
  expect(supported, "navigator.serviceWorker must be supported").toBe(true);

  const readyInfo = await page.evaluate(async (timeout: number) => {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out waiting for navigator.serviceWorker.ready")), timeout),
      ),
    ]);
    return {
      state: reg.active?.state ?? null,
      scope: reg.scope,
      hasController: Boolean(navigator.serviceWorker.controller),
    };
  }, timeoutMs);

  if (!readyInfo.hasController) {
    await page.reload({ waitUntil: "networkidle" });
    return page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return {
        state: reg.active?.state ?? null,
        scope: reg.scope,
        hasController: Boolean(navigator.serviceWorker.controller),
      };
    });
  }

  return readyInfo;
}

export async function getCachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (!("caches" in window)) return [];
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const key of keys) {
      const cache = await caches.open(key);
      const reqs = await cache.keys();
      for (const req of reqs) {
        urls.push(req.url);
      }
    }
    return urls;
  });
}

export interface RecordedWebhookRequest {
  id: number;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  json: Record<string, unknown> | null;
  receivedAt: string;
}

export interface MockNotificationServer {
  url: string;
  port: number;
  requests: RecordedWebhookRequest[];
  clear: () => void;
  setFailStatus: (statusCode: number | null) => void;
  setDelayMs: (ms: number) => void;
  waitForRequest: (
    predicate: (req: RecordedWebhookRequest) => boolean,
    timeoutMs?: number,
  ) => Promise<RecordedWebhookRequest>;
  close: () => Promise<void>;
}

export async function startMockNotificationServer(port = 0): Promise<MockNotificationServer> {
  const requests: RecordedWebhookRequest[] = [];
  let seq = 0;
  let failStatus: number | null = null;
  let delayMs = 0;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      seq += 1;
      const rawBody = Buffer.concat(chunks).toString("utf8");
      let parsed: Record<string, unknown> | null = null;
      try {
        const candidate: unknown = JSON.parse(rawBody);
        if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
          parsed = candidate as Record<string, unknown>;
        }
      } catch {
        parsed = null;
      }

      const path = req.url ?? "/";
      requests.push({
        id: seq,
        method: req.method ?? "GET",
        path,
        headers: req.headers,
        rawBody,
        json: parsed,
        receivedAt: new Date().toISOString(),
      });

      if (failStatus !== null) {
        res.writeHead(failStatus, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "mock_failure" }));
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      if (path.includes("/sendMessage")) {
        res.end(JSON.stringify({ ok: true, result: { message_id: seq } }));
      } else if (path.includes("/message/template")) {
        res.end(JSON.stringify({ error: 0, message: "Success", data: { msg_id: `zns_${seq}` } }));
      } else if (path.includes("/oa/message/cs")) {
        res.end(JSON.stringify({ error: 0, message: "Success", data: { message_id: `oa_${seq}` } }));
      } else if (path.includes("/emails")) {
        res.end(JSON.stringify({ id: `email_${seq}` }));
      } else {
        res.end(JSON.stringify({ ok: true }));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("MockNotificationServer failed to bind TCP port");
  }

  return {
    url: `http://127.0.0.1:${addr.port}`,
    port: addr.port,
    requests,
    clear: () => {
      requests.length = 0;
    },
    setFailStatus: (statusCode: number | null) => {
      failStatus = statusCode;
    },
    setDelayMs: (ms: number) => {
      delayMs = ms;
    },
    waitForRequest: async (predicate, timeoutMs = 5000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const match = requests.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Timed out waiting for mock webhook request (${requests.length} captured)`);
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

export function addDaysIso(dateStr: string, days: number): string {
  const parts = dateStr.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Returns a deterministic Monday date starting from 2099-01-05 + 7 * offsetWeeks.
 * Never touches seeded 2026-11-09 or 2026-11-16 schedules.
 */
export function uniqueFutureMonday(offsetWeeks: number): string {
  const base = new Date(Date.UTC(2099, 0, 5));
  const day = base.getUTCDay();
  const mondayShift = day === 0 ? 1 : (1 - day + 7) % 7;
  base.setUTCDate(base.getUTCDate() + mondayShift + offsetWeeks * 7);
  return base.toISOString().slice(0, 10);
}

/**
 * Finds an unused future Monday weekStart (>= 2099-01-05) so repeated E2E runs stay isolated.
 */
export async function findUnusedFutureMonday(
  request: APIRequestContext,
  ownerHeaders: Record<string, string>,
  startOffsetWeeks = 0,
): Promise<string> {
  for (let i = startOffsetWeeks; i < startOffsetWeeks + 400; i += 1) {
    const weekStart = uniqueFutureMonday(i);
    const res = await request.get(`${BASE_URL}/api/schedules?week=${weekStart}`, {
      headers: ownerHeaders,
    });
    if (!res.ok()) {
      throw new Error(`Failed checking schedule week ${weekStart}: ${res.status()}`);
    }
    const json = await apiJson<ScheduleDetailDto | null>(res);
    if (json.ok && json.data === null) {
      return weekStart;
    }
  }
  throw new Error("Could not find an unused future Monday schedule week");
}

export function getMondayForDateIso(dateStr: string): string {
  const parts = dateStr.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getVNClockNow(referenceDate: Date = new Date()): {
  dateStr: string;
  timeHm: string;
  minutesOfDay: number;
} {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
  const timeHm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(referenceDate);
  const [hStr, mStr] = timeHm.split(":");
  const h = Number(hStr ?? "0");
  const m = Number(mStr ?? "0");
  return {
    dateStr,
    timeHm,
    minutesOfDay: h * 60 + m,
  };
}

export function formatVnDateTimeLocalOffset(offsetMinutes: number): string {
  const vn = getVNClockNow(new Date(Date.now() + offsetMinutes * 60_000));
  return `${vn.dateStr}T${vn.timeHm}`;
}

export function minutesToHm(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface ReminderShiftWindow {
  workDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  startAtIso: string;
  endAtIso: string;
}

/**
 * Computes a VN-timezone shift window whose start ("start") or end ("end")
 * lands at `now + offsetMinutes` across all 1440 minutes of the day,
 * rolling `workDate` across midnight for start-reminders and using
 * overnight intervals for end-reminders near midnight.
 */
export function computeReminderShiftWindow(
  mode: "start" | "end",
  offsetMinutes: number,
  durationMinutes = 90,
  nowVn: { dateStr: string; timeHm: string; minutesOfDay: number } = getVNClockNow(),
): ReminderShiftWindow {
  if (mode === "start") {
    const totalStartMin = nowVn.minutesOfDay + offsetMinutes;
    const startDayOffset = Math.floor(totalStartMin / 1440);
    const workDate = startDayOffset === 0 ? nowVn.dateStr : addDaysIso(nowVn.dateStr, startDayOffset);
    const startMin = totalStartMin % 1440;
    const endMin = (startMin + durationMinutes) % 1440;
    const endDate = endMin > startMin ? workDate : addDaysIso(workDate, 1);
    const startTime = minutesToHm(startMin);
    const endTime = minutesToHm(endMin);
    return {
      workDate,
      endDate,
      startTime,
      endTime,
      startAtIso: `${workDate}T${startTime}:00+07:00`,
      endAtIso: `${endDate}T${endTime}:00+07:00`,
    };
  }

  const totalEndMin = nowVn.minutesOfDay + offsetMinutes;
  const endDayOffset = Math.floor(totalEndMin / 1440);
  const workDate = nowVn.dateStr;
  const endDate = endDayOffset === 0 ? workDate : addDaysIso(workDate, endDayOffset);
  const endMin = totalEndMin % 1440;
  const startMin =
    endDayOffset === 0
      ? Math.max(0, endMin - durationMinutes)
      : 1440 + endMin - durationMinutes;
  const startTime = minutesToHm(startMin);
  const endTime = minutesToHm(endMin);
  return {
    workDate,
    endDate,
    startTime,
    endTime,
    startAtIso: `${workDate}T${startTime}:00+07:00`,
    endAtIso: `${endDate}T${endTime}:00+07:00`,
  };
}

export async function ensureEditableWeekForDate(
  request: APIRequestContext,
  headers: Record<string, string>,
  workDate: string,
): Promise<{ schedule: ScheduleDetailDto; createdFresh: boolean }> {
  const weekStart = getMondayForDateIso(workDate);
  const existingRes = await request.get(`${BASE_URL}/api/schedules?week=${weekStart}`, { headers });
  const existingJson = await apiJson<ScheduleDetailDto | null>(existingRes);

  if (existingJson.ok && existingJson.data) {
    let sched = existingJson.data;
    if (sched.status === "LOCKED") {
      const unlockRes = await request.post(`${BASE_URL}/api/schedules/${sched.id}/status`, {
        headers,
        data: { action: "UNLOCK" },
      });
      if (unlockRes.ok()) {
        const unlocked = await apiJson<ScheduleDetailDto>(unlockRes);
        if (unlocked.data) sched = unlocked.data;
      }
    }
    return { schedule: sched, createdFresh: false };
  }

  const createRes = await request.post(`${BASE_URL}/api/schedules`, {
    headers,
    data: {
      weekStart,
      generateFromTemplates: false,
      name: `E2E Dynamic Week ${weekStart}`,
    },
  });
  if (!createRes.ok()) {
    throw new Error(`Failed creating schedule for ${weekStart}: ${createRes.status()} ${await createRes.text()}`);
  }
  const createdJson = await apiJson<ScheduleDetailDto>(createRes);
  if (!createdJson.data) {
    throw new Error("Missing created schedule payload");
  }
  return { schedule: createdJson.data, createdFresh: true };
}

export async function snapshotSettings(
  request: APIRequestContext,
  ownerHeaders: Record<string, string>,
): Promise<SystemSettingsBundle> {
  const res = await request.get(`${BASE_URL}/api/settings`, { headers: ownerHeaders });
  expect(res.ok(), `GET /api/settings failed: ${res.status()}`).toBe(true);
  const json = await apiJson<SystemSettingsBundle>(res);
  if (!json.ok || !json.data) {
    throw new Error("Invalid GET /api/settings response");
  }
  return json.data;
}

export async function restoreSettings(
  request: APIRequestContext,
  ownerHeaders: Record<string, string>,
  snapshot: SystemSettingsBundle,
): Promise<void> {
  const res = await request.put(`${BASE_URL}/api/settings`, {
    headers: ownerHeaders,
    data: snapshot,
  });
  expect(res.ok(), `PUT /api/settings restore failed: ${res.status()} ${await res.text()}`).toBe(true);
}

export async function updateNotificationPolicy(
  request: APIRequestContext,
  ownerHeaders: Record<string, string>,
  patch: Partial<NotificationPolicy>,
): Promise<SystemSettingsBundle> {
  const current = await snapshotSettings(request, ownerHeaders);
  const currentPolicy: NotificationPolicy = current.notificationPolicy ?? {
    enableTelegram: true,
    enableZalo: true,
    enableEmail: true,
    managerTelegramChatIds: [],
    groupTelegramChatId: null,
    shiftStartReminderMinutes: 15,
    shiftEndReminderMinutes: 15,
    cashDiscrepancyThresholdVnd: 0,
  };
  const updatedBundle: SystemSettingsBundle = {
    ...current,
    notificationPolicy: {
      ...currentPolicy,
      ...patch,
    },
  };
  const res = await request.put(`${BASE_URL}/api/settings`, {
    headers: ownerHeaders,
    data: updatedBundle,
  });
  expect(res.ok(), `PUT /api/settings failed: ${res.status()} ${await res.text()}`).toBe(true);
  const json = await apiJson<SystemSettingsBundle>(res);
  if (!json.ok || !json.data) {
    throw new Error("PUT /api/settings did not return bundle");
  }
  return json.data;
}

export async function getEmployees(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<EmployeeSummaryDto[]> {
  const res = await request.get(`${BASE_URL}/api/employees`, { headers });
  expect(res.ok(), `GET /api/employees failed: ${res.status()}`).toBe(true);
  const json = await apiJson<EmployeeSummaryDto[]>(res);
  return json.data ?? [];
}

export async function findEmployeeByCode(
  request: APIRequestContext,
  headers: Record<string, string>,
  employeeCode: string,
): Promise<EmployeeSummaryDto> {
  const list = await getEmployees(request, headers);
  const found = list.find((e) => e.employeeCode === employeeCode);
  if (!found) {
    throw new Error(`Seeded employee ${employeeCode} not found`);
  }
  return found;
}

export async function getPositions(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<PositionDto[]> {
  const res = await request.get(`${BASE_URL}/api/positions`, { headers });
  expect(res.ok(), `GET /api/positions failed: ${res.status()}`).toBe(true);
  const json = await apiJson<PositionDto[]>(res);
  return json.data ?? [];
}

export async function updateEmployeeContacts(
  request: APIRequestContext,
  ownerHeaders: Record<string, string>,
  employeeId: string,
  patch: {
    telegramChatId?: string | null;
    zaloUserId?: string | null;
    notificationPreferences?: NotificationPreferences;
  },
): Promise<APIResponse> {
  return request.patch(`${BASE_URL}/api/employees/${employeeId}`, {
    headers: ownerHeaders,
    data: patch,
  });
}

export async function updateSelfNotificationContacts(
  request: APIRequestContext,
  headers: Record<string, string>,
  patch: {
    telegramChatId?: string | null;
    zaloUserId?: string | null;
    notificationPreferences?: NotificationPreferences;
  },
): Promise<{ status: number; endpoint: string; body: ApiEnvelope<Record<string, unknown>> }> {
  const primary = "/api/profile/notifications";
  const res = await request.patch(`${BASE_URL}${primary}`, {
    headers,
    data: patch,
  });
  if (res.status() !== 404) {
    return {
      status: res.status(),
      endpoint: primary,
      body: await apiJson<Record<string, unknown>>(res),
    };
  }
  const fallback = "/api/auth/me/notifications";
  const fallbackRes = await request.patch(`${BASE_URL}${fallback}`, {
    headers,
    data: patch,
  });
  return {
    status: fallbackRes.status(),
    endpoint: fallback,
    body: await apiJson<Record<string, unknown>>(fallbackRes),
  };
}

export async function getNotifications(
  request: APIRequestContext,
  headers: Record<string, string>,
  unreadOnly = false,
): Promise<NotificationListDto> {
  const qs = unreadOnly ? "?unread=true" : "";
  const res = await request.get(`${BASE_URL}/api/notifications${qs}`, { headers });
  expect(res.ok(), `GET /api/notifications failed: ${res.status()}`).toBe(true);
  const json = await apiJson<NotificationListDto>(res);
  return json.data ?? { unreadCount: 0, items: [] };
}

export async function markAllNotificationsRead(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<void> {
  const res = await request.post(`${BASE_URL}/api/notifications/read-all`, { headers });
  expect(res.ok(), `POST /api/notifications/read-all failed: ${res.status()}`).toBe(true);
}

export async function createScheduleWeek(
  request: APIRequestContext,
  headers: Record<string, string>,
  weekStart: string,
  generateFromTemplates = false,
): Promise<ScheduleDetailDto> {
  const res = await request.post(`${BASE_URL}/api/schedules`, {
    headers,
    data: { weekStart, generateFromTemplates },
  });
  expect(res.status(), `POST /api/schedules failed: ${res.status()} ${await res.text()}`).toBe(201);
  const json = await apiJson<ScheduleDetailDto>(res);
  if (!json.data) {
    throw new Error("POST /api/schedules returned empty data");
  }
  return json.data;
}

export async function createShiftInSchedule(
  request: APIRequestContext,
  headers: Record<string, string>,
  scheduleId: string,
  input: {
    workDate: string;
    name: string;
    startTime: string;
    endTime: string;
    requiredStaff?: number;
    maxStaff?: number;
  },
): Promise<{ id: string }> {
  const res = await request.post(`${BASE_URL}/api/schedules/${scheduleId}/shifts`, {
    headers,
    data: {
      workDate: input.workDate,
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      requiredStaff: input.requiredStaff ?? 1,
      maxStaff: input.maxStaff ?? 2,
      breakMinutes: 0,
      isPeak: false,
      positionRequirements: [],
    },
  });
  expect(res.status(), `POST /api/schedules/${scheduleId}/shifts failed: ${res.status()} ${await res.text()}`).toBe(201);
  const json = await apiJson<{ id: string }>(res);
  if (!json.data) {
    throw new Error("POST /shifts returned empty data");
  }
  return json.data;
}

export async function assignEmployeeToShift(
  request: APIRequestContext,
  headers: Record<string, string>,
  shiftId: string,
  employeeId: string,
  positionId?: string,
  allowWarnings = true,
): Promise<APIResponse> {
  return request.post(`${BASE_URL}/api/shifts/${shiftId}/assignments`, {
    headers,
    data: {
      employeeId,
      ...(positionId ? { positionId } : {}),
      allowWarnings,
    },
  });
}

export async function changeScheduleStatus(
  request: APIRequestContext,
  headers: Record<string, string>,
  scheduleId: string,
  action: "PUBLISH" | "LOCK" | "UNLOCK" | "ARCHIVE",
): Promise<APIResponse> {
  return request.post(`${BASE_URL}/api/schedules/${scheduleId}/status`, {
    headers,
    data: { action },
  });
}

export async function deleteShiftSafe(
  request: APIRequestContext,
  headers: Record<string, string>,
  shiftId: string | null | undefined,
): Promise<void> {
  if (!shiftId) return;
  try {
    await request.delete(`${BASE_URL}/api/shifts/${shiftId}`, { headers });
  } catch {
    // Best-effort cleanup inside finally blocks
  }
}

export async function pickEmployeeWithoutApprovedLeave(
  request: APIRequestContext,
  ownerHeaders: Record<string, string>,
  candidateKeys: readonly SeededUserKey[],
  startAtIso: string,
  endAtIso: string,
): Promise<{ userKey: SeededUserKey; employee: EmployeeSummaryDto }> {
  const res = await request.get(`${BASE_URL}/api/leaves?status=APPROVED`, { headers: ownerHeaders });
  expect(res.ok(), `GET /api/leaves?status=APPROVED failed: ${res.status()}`).toBe(true);
  const json = await apiJson<LeaveRequestDto[]>(res);
  const approvedLeaves = json.data ?? [];
  const targetStart = new Date(startAtIso).getTime();
  const targetEnd = new Date(endAtIso).getTime();
  const employees = await getEmployees(request, ownerHeaders);

  for (const userKey of candidateKeys) {
    const code = SEEDED_USERS[userKey].code;
    const emp = employees.find((e) => e.employeeCode === code);
    if (!emp) continue;
    const hasOverlap = approvedLeaves.some((l) => {
      if (l.employeeId !== emp.id || !l.startAt || !l.endAt) return false;
      const lStart = new Date(l.startAt).getTime();
      const lEnd = new Date(l.endAt).getTime();
      return lStart < targetEnd && targetStart < lEnd;
    });
    if (!hasOverlap) {
      return { userKey, employee: emp };
    }
  }

  const fallbackKey = candidateKeys[0];
  if (!fallbackKey) {
    throw new Error("candidateKeys cannot be empty");
  }
  const fallbackEmp = await findEmployeeByCode(request, ownerHeaders, SEEDED_USERS[fallbackKey].code);
  return { userKey: fallbackKey, employee: fallbackEmp };
}

export function buildHandoverPayload(params: {
  shiftId: string;
  handoverEmployeeId: string;
  receivingEmployeeId?: string;
  openingCashVnd: number;
  cashSalesVnd: number;
  cashExpensesVnd: number;
  actualClosingCashVnd: number;
  cashDiscrepancyReason?: string;
  handoverNotes?: string;
}): Record<string, unknown> {
  return {
    shiftId: params.shiftId,
    handoverEmployeeId: params.handoverEmployeeId,
    ...(params.receivingEmployeeId ? { receivingEmployeeId: params.receivingEmployeeId } : {}),
    reconciliation: {
      openingCashVnd: params.openingCashVnd,
      cashSalesVnd: params.cashSalesVnd,
      cashExpensesVnd: params.cashExpensesVnd,
      actualClosingCashVnd: params.actualClosingCashVnd,
    },
    ...(params.cashDiscrepancyReason ? { cashDiscrepancyReason: params.cashDiscrepancyReason } : {}),
    inventory: [
      { item: "Cà phê hạt Arabica", currentQty: 5, unit: "kg", condition: "ENOUGH" },
      { item: "Sữa tươi không đường", currentQty: 12, unit: "hộp", condition: "ENOUGH" },
    ],
    equipment: [
      { name: "Máy pha Espresso 2 Group", status: "OK", note: "Hoạt động bình thường" },
      { name: "Máy tính tiền POS", status: "OK", note: "Đã đối soát cuối ca" },
    ],
    cleanliness: [
      { area: "[1] Vệ sinh quầy bar & máy pha", isDone: true, isDueToday: true },
      { area: "[2] Thu dọn khu vực bàn khách", isDone: true, isDueToday: true },
    ],
    customerNotes: "Khách ổn định, không phát sinh khiếu nại",
    pendingTasks: [],
    handoverNotes: params.handoverNotes ?? "Bàn giao ca đầy đủ theo quy trình 8 bước",
  };
}
