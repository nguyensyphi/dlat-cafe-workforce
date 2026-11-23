import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerSession = vi.fn();
const mockDispatchDueReminders = vi.fn();

vi.mock("@/lib/auth", () => ({
  getServerSession: () => mockGetServerSession(),
}));

vi.mock("@/modules/notifications/shift-reminder.service", () => ({
  shiftReminderService: {
    dispatchDueReminders: (...args: unknown[]) =>
      mockDispatchDueReminders(...args),
  },
}));

import { GET, POST } from "@/app/api/cron/shift-reminders/route";

describe("Cron Shift Reminders Route (/api/cron/shift-reminders)", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatchDueReminders.mockResolvedValue({
      checkedAssignments: 2,
      dueReminders: 1,
      createdInApp: 1,
      skippedDuplicates: 0,
      insertedDedupeKeys: ["SHIFT_START:s1:e1"],
      externalDispatched: 1,
    });
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("rejects unauthenticated requests with 401 when no cron header and no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost:3005/api/cron/shift-reminders", {
      method: "POST",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(mockDispatchDueReminders).not.toHaveBeenCalled();
  });

  it("rejects EMPLOYEE session with 403 FORBIDDEN", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      userId: "u-emp",
      email: "nam.le@dlatcafe.vn",
      role: "EMPLOYEE",
      employeeId: "e-nam",
      fullName: "Lê Hoàng Nam",
    });

    const req = new NextRequest("http://localhost:3005/api/cron/shift-reminders", {
      method: "POST",
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(mockDispatchDueReminders).not.toHaveBeenCalled();
  });

  it("rejects invalid x-cron-secret or Bearer token with 401 even if CRON_SECRET is set or unset", async () => {
    process.env.CRON_SECRET = "real-secret-token";

    const req1 = new NextRequest("http://localhost:3005/api/cron/shift-reminders", {
      method: "POST",
      headers: { "x-cron-secret": "wrong-secret" },
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(401);

    const req2 = new NextRequest("http://localhost:3005/api/cron/shift-reminders", {
      method: "GET",
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const res2 = await GET(req2);
    expect(res2.status).toBe(401);
    expect(mockDispatchDueReminders).not.toHaveBeenCalled();
  });

  it("authorizes valid CRON_SECRET via Bearer or x-cron-secret and forwards optional now parameter", async () => {
    process.env.CRON_SECRET = "my-cron-secret-999";

    const req = new NextRequest(
      "http://localhost:3005/api/cron/shift-reminders?now=2099-05-10T06:50:00.000Z",
      {
        method: "POST",
        headers: { Authorization: "Bearer my-cron-secret-999" },
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.createdInApp).toBe(1);
    expect(mockDispatchDueReminders).toHaveBeenCalledTimes(1);
    const arg = mockDispatchDueReminders.mock.calls[0]?.[0] as { now?: Date };
    expect(arg?.now?.toISOString()).toBe("2099-05-10T06:50:00.000Z");
  });

  it("authorizes MANAGER and OWNER sessions when cron headers are omitted", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      userId: "u-mgr",
      email: "manager@dlatcafe.vn",
      role: "MANAGER",
      employeeId: "e-mgr",
      fullName: "Trần Thanh Thảo",
    });

    const req = new NextRequest("http://localhost:3005/api/cron/shift-reminders", {
      method: "POST",
      body: JSON.stringify({ now: "2099-05-10T10:50:00.000Z" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockDispatchDueReminders).toHaveBeenCalledTimes(1);
  });
});
