import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    employee: { count: vi.fn() },
    position: { findMany: vi.fn() },
    shiftTemplate: { count: vi.fn() },
    leaveRequest: { count: vi.fn() },
    swapRequest: { count: vi.fn() },
    shift: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    shiftHandover: { findMany: vi.fn(), count: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  dashboardService,
  invalidateDashboardCache,
} from "@/modules/dashboard/dashboard.service";

const OWNER_ACTOR: SessionUser = {
  userId: "owner-1",
  email: "owner@dlatcafe.vn",
  role: "OWNER",
  employeeId: null,
  fullName: "Chủ quán",
};

function setupPrismaMocks(pendingLeaves: number, pendingSwaps: number) {
  mockPrisma.employee.count.mockResolvedValueOnce(10).mockResolvedValueOnce(1);
  mockPrisma.position.findMany.mockResolvedValueOnce([]);
  mockPrisma.shiftTemplate.count.mockResolvedValueOnce(4);
  mockPrisma.leaveRequest.count.mockResolvedValueOnce(pendingLeaves);
  mockPrisma.swapRequest.count.mockResolvedValueOnce(pendingSwaps);
  mockPrisma.shift.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
  mockPrisma.attendance.findMany.mockResolvedValueOnce([]);
  mockPrisma.shiftHandover.findMany.mockResolvedValueOnce([]);
  mockPrisma.shiftHandover.count.mockResolvedValueOnce(0);
  mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
}

describe("dashboardService cache & invalidateDashboardCache()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateDashboardCache();
  });

  it("serves cached metrics within the 15s TTL window without re-querying Prisma", async () => {
    setupPrismaMocks(2, 1);

    const first = await dashboardService.getManagementMetrics(OWNER_ACTOR);
    expect(first.pendingLeaveCount).toBe(2);
    expect(first.pendingSwapCount).toBe(1);
    expect(mockPrisma.leaveRequest.count).toHaveBeenCalledTimes(1);

    // Second call within TTL must hit cache
    const second = await dashboardService.getManagementMetrics(OWNER_ACTOR);
    expect(second).toBe(first);
    expect(mockPrisma.leaveRequest.count).toHaveBeenCalledTimes(1);
  });

  it("immediately busts the cache when invalidateDashboardCache() is called", async () => {
    setupPrismaMocks(2, 1);
    const first = await dashboardService.getManagementMetrics(OWNER_ACTOR);
    expect(first.pendingLeaveCount).toBe(2);
    expect(first.pendingSwapCount).toBe(1);

    // Simulate a mutation calling invalidateDashboardCache()
    invalidateDashboardCache();
    setupPrismaMocks(3, 0);

    const refreshed = await dashboardService.getManagementMetrics(OWNER_ACTOR);
    expect(refreshed.pendingLeaveCount).toBe(3);
    expect(refreshed.pendingSwapCount).toBe(0);
    expect(mockPrisma.leaveRequest.count).toHaveBeenCalledTimes(2);
  });
});
