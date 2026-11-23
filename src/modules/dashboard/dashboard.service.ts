import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  HO_CHI_MINH_TZ,
  getWeekMondayDateString,
  parseDateOnlyUtc,
} from "@/lib/date";
import { assertPermission } from "@/lib/permissions";

export interface ManagementDashboardMetrics {
  activeEmployees: number;
  inactiveEmployees: number;
  workingTodayCount: number;
  shiftsTodayCount: number;
  understaffedShiftsToday: number;
  missingClockInToday: number;
  pendingLeaveCount: number;
  pendingSwapCount: number;
  weeklyScheduledHours: number;
  estimatedWeeklyLaborCostVnd: string;
  estimatedMonthlyLaborCostVnd: string;
  monthlyCashDiscrepancyVnd: string;
  monthlyCashDiscrepancyAbsVnd: string;
  cashDiscrepancyCount: number;
  disputedHandoverCount: number;
  activePositionsCount: number;
  activeShiftTemplatesCount: number;
  positionBreakdown: Array<{
    id: string;
    name: string;
    primaryCount: number;
    skilledCount: number;
  }>;
  recentAuditLogs: Array<{
    id: string;
    action: string;
    entityType: string;
    actorEmail: string;
    createdAt: string;
  }>;
}

let cachedMetrics: ManagementDashboardMetrics | null = null;
let lastCacheTimestamp = 0;
const CACHE_TTL_MS = 15_000; // 15s TTL for dashboard metrics

export function invalidateDashboardCache() {
  cachedMetrics = null;
  lastCacheTimestamp = 0;
}

export const dashboardService = {
  async getManagementMetrics(
    actor: SessionUser,
  ): Promise<ManagementDashboardMetrics> {
    assertPermission(actor.role, "dashboard:manage");

    if (cachedMetrics && Date.now() - lastCacheTimestamp < CACHE_TTL_MS) {
      return cachedMetrics;
    }

    const now = new Date();
    const todayIso = formatInTimeZone(now, HO_CHI_MINH_TZ, "yyyy-MM-dd");
    const todayUtc = parseDateOnlyUtc(todayIso);
    const weekStartIso = getWeekMondayDateString(todayIso);
    const weekStartUtc = parseDateOnlyUtc(weekStartIso);
    const weekEndUtc = new Date(weekStartUtc.getTime());
    weekEndUtc.setUTCDate(weekEndUtc.getUTCDate() + 6);

    const yearNum = Number(todayIso.slice(0, 4));
    const monthNum = Number(todayIso.slice(5, 7));
    const monthStartUtc = new Date(Date.UTC(yearNum, monthNum - 1, 1));
    const monthEndUtc = new Date(Date.UTC(yearNum, monthNum, 0));

    const [
      activeEmployees,
      inactiveEmployees,
      activePositions,
      activeShiftTemplatesCount,
      pendingLeaveCount,
      pendingSwapCount,
      todayShifts,
      todayAttendances,
      weekShifts,
      monthShifts,
      monthHandovers,
      disputedHandoverCount,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.employee.count({ where: { status: "ACTIVE" } }),
      prisma.employee.count({ where: { status: "INACTIVE" } }),
      prisma.position.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { primaryEmployees: true, employeeSkills: true } },
        },
      }),
      prisma.shiftTemplate.count({ where: { isActive: true } }),
      prisma.leaveRequest.count({ where: { status: "PENDING" } }),
      prisma.swapRequest.count({
        where: { status: { in: ["PENDING", "ACCEPTED"] } },
      }),
      prisma.shift.findMany({
        where: {
          workDate: todayUtc,
          status: { not: "CANCELLED" },
          schedule: { status: { in: ["PUBLISHED", "LOCKED"] } },
        },
        include: {
          assignments: { where: { status: "ASSIGNED" } },
        },
      }),
      prisma.attendance.findMany({
        where: { workDate: todayUtc },
        select: { employeeId: true, shiftId: true, clockIn: true },
      }),
      prisma.shift.findMany({
        where: {
          workDate: { gte: weekStartUtc, lte: weekEndUtc },
          status: { not: "CANCELLED" },
          schedule: { status: { in: ["PUBLISHED", "LOCKED"] } },
        },
        include: {
          assignments: {
            where: { status: "ASSIGNED" },
            include: {
              employee: {
                include: {
                  payRates: {
                    where: { effectiveTo: null },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      }),
      prisma.shift.findMany({
        where: {
          workDate: { gte: monthStartUtc, lte: monthEndUtc },
          status: { not: "CANCELLED" },
          schedule: { status: { in: ["PUBLISHED", "LOCKED"] } },
        },
        include: {
          assignments: {
            where: { status: "ASSIGNED" },
            include: {
              employee: {
                include: {
                  payRates: {
                    where: { effectiveTo: null },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      }),
      prisma.shiftHandover.findMany({
        where: {
          shift: {
            workDate: { gte: monthStartUtc, lte: monthEndUtc },
          },
        },
        select: {
          cashDifferenceVnd: true,
        },
      }),
      prisma.shiftHandover.count({
        where: {
          status: "DISCREPANCY",
          shift: {
            workDate: { gte: monthStartUtc, lte: monthEndUtc },
          },
        },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { user: { select: { email: true } } },
      }),
    ]);

    const workingEmployeeSet = new Set<string>();
    let understaffedShiftsToday = 0;
    let missingClockInToday = 0;

    for (const shift of todayShifts) {
      if (shift.assignments.length < shift.requiredStaff) {
        understaffedShiftsToday += 1;
      }
      for (const assign of shift.assignments) {
        workingEmployeeSet.add(assign.employeeId);
        if (shift.startAt <= now) {
          const hasPunched = todayAttendances.some(
            (a) =>
              a.employeeId === assign.employeeId &&
              a.shiftId === shift.id &&
              a.clockIn !== null,
          );
          if (!hasPunched) {
            missingClockInToday += 1;
          }
        }
      }
    }

    let weeklyScheduledMinutes = 0;
    let estimatedWeeklyLaborCost = 0n;

    for (const shift of weekShifts) {
      const durationMin = Math.max(
        0,
        Math.round((shift.endAt.getTime() - shift.startAt.getTime()) / 60000) -
          shift.breakMinutes,
      );
      for (const assign of shift.assignments) {
        weeklyScheduledMinutes += durationMin;
        const rate = assign.employee.payRates[0]?.hourlyRate ?? 0n;
        estimatedWeeklyLaborCost += (rate * BigInt(durationMin)) / 60n;
      }
    }

    let estimatedMonthlyLaborCost = 0n;
    for (const shift of monthShifts) {
      const durationMin = Math.max(
        0,
        Math.round((shift.endAt.getTime() - shift.startAt.getTime()) / 60000) -
          shift.breakMinutes,
      );
      for (const assign of shift.assignments) {
        const rate = assign.employee.payRates[0]?.hourlyRate ?? 0n;
        estimatedMonthlyLaborCost += (rate * BigInt(durationMin)) / 60n;
      }
    }

    let monthlyCashDiscrepancy = 0n;
    let monthlyCashDiscrepancyAbs = 0n;
    let cashDiscrepancyCount = 0;
    for (const h of monthHandovers) {
      const diff = h.cashDifferenceVnd ?? 0n;
      monthlyCashDiscrepancy += diff;
      if (diff !== 0n) {
        cashDiscrepancyCount += 1;
        monthlyCashDiscrepancyAbs += diff < 0n ? -diff : diff;
      }
    }

    const result: ManagementDashboardMetrics = {
      activeEmployees,
      inactiveEmployees,
      workingTodayCount: workingEmployeeSet.size,
      shiftsTodayCount: todayShifts.length,
      understaffedShiftsToday,
      missingClockInToday,
      pendingLeaveCount,
      pendingSwapCount,
      weeklyScheduledHours: Math.round((weeklyScheduledMinutes / 60) * 10) / 10,
      estimatedWeeklyLaborCostVnd: estimatedWeeklyLaborCost.toString(),
      estimatedMonthlyLaborCostVnd: estimatedMonthlyLaborCost.toString(),
      monthlyCashDiscrepancyVnd: monthlyCashDiscrepancy.toString(),
      monthlyCashDiscrepancyAbsVnd: monthlyCashDiscrepancyAbs.toString(),
      cashDiscrepancyCount,
      disputedHandoverCount,
      activePositionsCount: activePositions.length,
      activeShiftTemplatesCount,
      positionBreakdown: activePositions.map((p) => ({
        id: p.id,
        name: p.name,
        primaryCount: p._count.primaryEmployees,
        skilledCount: p._count.employeeSkills,
      })),
      recentAuditLogs: recentAuditLogs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        actorEmail: l.user?.email ?? "Hệ thống",
        createdAt: l.createdAt.toISOString(),
      })),
    };

    cachedMetrics = result;
    lastCacheTimestamp = Date.now();
    return result;
  },
};

