import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { formatDateVN, formatIsoDateOnly, formatTimeVN, parseDateOnlyUtc } from "@/lib/date";
import { assertPermission } from "@/lib/permissions";

export class ReportsService {
  /**
   * Aggregates data for Recharts analytics dashboard.
   */
  async getOverviewAnalytics(actor: SessionUser) {
    assertPermission(actor.role, "reports:read");

    // 1. Fetch recent payroll periods
    const periods = await prisma.payrollPeriod.findMany({
      orderBy: { periodStart: "desc" },
      take: 6,
      include: {
        items: {
          include: {
            employee: {
              include: { primaryPosition: true },
            },
          },
        },
      },
    });

    const laborCostTrends = [...periods].reverse().map((p) => {
      let regularPay = 0;
      let overtimePay = 0;
      let totalPay = 0;
      let scheduledHours = 0;
      let workedHours = 0;
      let paidHours = 0;

      for (const item of p.items) {
        regularPay += Number(item.basePay);
        overtimePay += Number(item.overtimePay);
        totalPay += Number(item.totalPay);
        scheduledHours += Number(item.scheduledHours);
        workedHours += Number(item.workedHours);
        paidHours += Number(item.paidHours);
      }

      return {
        name: p.name,
        periodStart: formatIsoDateOnly(p.periodStart),
        regularPay,
        overtimePay,
        totalPay,
        scheduledHours: Number(scheduledHours.toFixed(1)),
        workedHours: Number(workedHours.toFixed(1)),
        paidHours: Number(paidHours.toFixed(1)),
      };
    });

    // 2. Position labor cost distribution (from latest period or recent attendances)
    const positionMap = new Map<string, { count: number; totalCost: number; hours: number }>();
    const latest = periods.length > 0 ? periods[0] : null;
    if (latest) {
      for (const item of latest.items) {
        const posName = item.employee.primaryPosition.name;
        const entry = positionMap.get(posName) || { count: 0, totalCost: 0, hours: 0 };
        entry.count += 1;
        entry.totalCost += Number(item.totalPay);
        entry.hours += Number(item.paidHours);
        positionMap.set(posName, entry);
      }
    }

    const positionDistribution = Array.from(positionMap.entries()).map(([name, val]) => ({
      name,
      totalCost: val.totalCost,
      hours: Number(val.hours.toFixed(1)),
      headcount: val.count,
    }));

    // 3. Attendance statistics from past 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const attendances = await prisma.attendance.findMany({
      where: {
        workDate: { gte: thirtyDaysAgo },
      },
      select: {
        lateMinutes: true,
        earlyLeaveMinutes: true,
        isMissingClockOut: true,
        status: true,
        clockIn: true,
      },
    });

    let onTimeCount = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;
    let missingClockOutCount = 0;

    for (const a of attendances) {
      if (a.isMissingClockOut) {
        missingClockOutCount += 1;
      } else if (a.lateMinutes > 0) {
        lateCount += 1;
      } else if (a.earlyLeaveMinutes > 0) {
        earlyLeaveCount += 1;
      } else if (a.clockIn) {
        onTimeCount += 1;
      }
    }

    const attendanceStats = [
      { name: "Đúng giờ", value: onTimeCount, fill: "#16a34a" },
      { name: "Đi trễ", value: lateCount, fill: "#d97706" },
      { name: "Về sớm", value: earlyLeaveCount, fill: "#ea580c" },
      { name: "Quên chấm về", value: missingClockOutCount, fill: "#dc2626" },
    ];

    return {
      laborCostTrends,
      positionDistribution,
      attendanceStats,
      totalRecordsAnalyzed: attendances.length,
    };
  }

  /**
   * Generates a UTF-8 CSV with Byte Order Mark (\uFEFF) for Vietnamese Excel compatibility.
   */
  async exportPayrollCsv(actor: SessionUser, periodId: string): Promise<string> {
    assertPermission(actor.role, "reports:read");

    const p = await prisma.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
      include: {
        items: {
          include: {
            employee: {
              include: { primaryPosition: true },
            },
          },
          orderBy: { employee: { employeeCode: "asc" } },
        },
      },
    });

    const headers = [
      "Mã NV",
      "Họ và tên",
      "Vị trí",
      "Giờ theo ca (T1)",
      "Giờ thực tế (T2)",
      "Giờ duyệt (T3)",
      "Giờ tính lương (T4)",
      "Giờ tăng ca",
      "Đơn giá giờ (VND)",
      "Lương cơ bản (VND)",
      "Lương tăng ca (VND)",
      "Phụ cấp (VND)",
      "Thưởng (VND)",
      "Khấu trừ (VND)",
      "Điều chỉnh (VND)",
      "Thực lĩnh (VND)",
      "Lý do điều chỉnh",
    ];

    const rows = p.items.map((i) => [
      `"${i.employee.employeeCode}"`,
      `"${i.employee.fullName}"`,
      `"${i.employee.primaryPosition.name}"`,
      Number(i.scheduledHours).toFixed(2),
      Number(i.workedHours).toFixed(2),
      Number(i.approvedHours).toFixed(2),
      Number(i.paidHours).toFixed(2),
      Number(i.overtimeHours).toFixed(2),
      i.hourlyRateSnapshot.toString(),
      i.basePay.toString(),
      i.overtimePay.toString(),
      i.allowances.toString(),
      i.bonuses.toString(),
      i.deductions.toString(),
      i.adjustments.toString(),
      i.totalPay.toString(),
      `"${i.adjustmentReason ?? ""}"`,
    ]);

    // Prepend UTF-8 BOM for Microsoft Excel Vietnamese diacritics
    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    return csvContent;
  }

  /**
   * Generates attendance records CSV with UTF-8 BOM.
   */
  async exportAttendanceCsv(
    actor: SessionUser,
    filters: { startDate?: string; endDate?: string } = {},
  ): Promise<string> {
    assertPermission(actor.role, "reports:read");

    const where: Prisma.AttendanceWhereInput = {};
    if (filters.startDate || filters.endDate) {
      where.workDate = {};
      if (filters.startDate) where.workDate.gte = parseDateOnlyUtc(filters.startDate);
      if (filters.endDate) where.workDate.lte = parseDateOnlyUtc(filters.endDate);
    }

    const attendances = await prisma.attendance.findMany({
      where,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: {
        employee: true,
        shift: true,
        approvedBy: {
          select: { email: true, employee: { select: { fullName: true } } },
        },
      },
      take: 500,
    });

    const headers = [
      "Mã NV",
      "Họ và tên",
      "Ngày làm việc",
      "Ca làm việc",
      "Giờ vào ca",
      "Giờ tan ca",
      "Giờ theo ca (T1)",
      "Giờ thực tế (T2)",
      "Giờ duyệt (T3)",
      "Giờ tính lương (T4)",
      "Trễ (phút)",
      "Về sớm (phút)",
      "Trạng thái",
      "Người duyệt",
      "Lý do điều chỉnh",
    ];

    const rows = attendances.map((a) => [
      `"${a.employee.employeeCode}"`,
      `"${a.employee.fullName}"`,
      `"${formatDateVN(a.workDate)}"`,
      `"${a.shift?.name ?? "Không theo ca"}"`,
      a.clockIn ? `"${formatTimeVN(a.clockIn)}"` : '""',
      a.clockOut ? `"${formatTimeVN(a.clockOut)}"` : '""',
      (a.scheduledMinutes / 60).toFixed(2),
      (a.workedMinutes / 60).toFixed(2),
      a.approvedMinutes !== null ? (a.approvedMinutes / 60).toFixed(2) : '""',
      a.paidMinutes !== null ? (a.paidMinutes / 60).toFixed(2) : '""',
      a.lateMinutes.toString(),
      a.earlyLeaveMinutes.toString(),
      a.isMissingClockOut ? '"Quên chấm về"' : `"${a.status}"`,
      `"${a.approvedBy?.employee?.fullName ?? a.approvedBy?.email ?? ""}"`,
      `"${a.adjustmentReason ?? ""}"`,
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    return csvContent;
  }
}

export const reportsService = new ReportsService();
