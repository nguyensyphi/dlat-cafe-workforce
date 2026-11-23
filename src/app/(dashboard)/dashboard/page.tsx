import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Briefcase,
  CalendarClock,
  Clock,
  DollarSign,
  FileWarning,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { requireServerSession } from "@/lib/auth";
import { formatVnd } from "@/lib/currency";
import { formatDateTimeVN } from "@/lib/date";
import { dashboardService } from "@/modules/dashboard/dashboard.service";
import { attendanceMonitorService } from "@/modules/attendance/attendance-monitor.service";
import { AttendanceAlertsPanel } from "@/components/attendance/attendance-alerts-panel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ManagementDashboardPage() {
  const actor = await requireServerSession("dashboard:manage");
  const [metrics, attendanceAlerts] = await Promise.all([
    dashboardService.getManagementMetrics(actor),
    attendanceMonitorService.getActiveAttendanceAlerts(),
  ]);

  const kpiCards = [
    {
      title: "Nhân viên đang hoạt động",
      value: `${metrics.activeEmployees}`,
      sub: `${metrics.inactiveEmployees} nhân sự ngừng hoạt động`,
      icon: Users,
      accent: "text-emerald-600 bg-emerald-50",
      href: "/employees",
    },
    {
      title: "Đi làm hôm nay",
      value: `${metrics.workingTodayCount} người`,
      sub: `Trên tổng ${metrics.shiftsTodayCount} ca đã công bố hôm nay`,
      icon: UserCheck,
      accent: "text-blue-600 bg-blue-50",
      href: "/attendance",
    },
    {
      title: "Ca thiếu nhân sự hôm nay",
      value: `${metrics.understaffedShiftsToday} ca`,
      sub:
        metrics.understaffedShiftsToday > 0
          ? "Cần bổ sung người vào ca"
          : "Tất cả ca hôm nay đủ định biên",
      icon: AlertTriangle,
      accent:
        metrics.understaffedShiftsToday > 0
          ? "text-amber-600 bg-amber-50"
          : "text-emerald-600 bg-emerald-50",
      href: "/schedules",
    },
    {
      title: "Chưa chấm công vào ca",
      value: `${metrics.missingClockInToday}`,
      sub: "Tính các ca đã bắt đầu trong ngày",
      icon: Clock,
      accent:
        metrics.missingClockInToday > 0
          ? "text-red-600 bg-red-50"
          : "text-slate-600 bg-slate-100",
      href: "/attendance",
    },
    {
      title: "Yêu cầu xin nghỉ chờ duyệt",
      value: `${metrics.pendingLeaveCount}`,
      sub: "Đơn nghỉ phép đang ở trạng thái Chờ duyệt",
      icon: FileWarning,
      accent: "text-amber-600 bg-amber-50",
      href: "/requests",
    },
    {
      title: "Yêu cầu đổi ca chờ duyệt",
      value: `${metrics.pendingSwapCount}`,
      sub: "Đơn đổi ca giữa các nhân viên",
      icon: RefreshCw,
      accent: "text-indigo-600 bg-indigo-50",
      href: "/requests",
    },
    {
      title: "Tổng giờ công lịch tuần này",
      value: `${metrics.weeklyScheduledHours} giờ`,
      sub: "Tính trên lịch tuần đã công bố",
      icon: CalendarClock,
      accent: "text-emerald-600 bg-emerald-50",
      href: "/schedules",
    },
    {
      title: "Chi phí nhân sự dự kiến tuần",
      value: formatVnd(metrics.estimatedWeeklyLaborCostVnd),
      sub: "Ước tính theo đơn giá giờ hiện hành",
      icon: DollarSign,
      accent: "text-emerald-600 bg-emerald-50",
      href: "/payroll",
    },
  ];

  const anomalyTotal =
    attendanceAlerts.missingClockOuts.length +
    attendanceAlerts.lateOrNoShows.length;
  const monthlyCashDiscrepancyBigInt = BigInt(
    metrics.monthlyCashDiscrepancyVnd || "0",
  );
  const monthlyCashDiscrepancyAbsBigInt = BigInt(
    metrics.monthlyCashDiscrepancyAbsVnd || "0",
  );
  const hasCashDiscrepancy =
    monthlyCashDiscrepancyBigInt !== 0n ||
    metrics.cashDiscrepancyCount > 0 ||
    metrics.disputedHandoverCount > 0;
  const formattedCashDiscrepancy =
    monthlyCashDiscrepancyBigInt > 0n
      ? `+${formatVnd(monthlyCashDiscrepancyBigInt)}`
      : monthlyCashDiscrepancyBigInt < 0n
        ? `-${formatVnd(-monthlyCashDiscrepancyBigInt)}`
        : formatVnd(0n);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Tổng quan vận hành
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Số liệu thời gian thực của D&apos;lat Cafe ({metrics.activePositionsCount} vị
            trí • {metrics.activeShiftTemplatesCount} khung ca mẫu đang bật)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/employees"
            className="inline-flex min-h-[44px] flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <span>Quản lý nhân sự</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/shifts"
            className="inline-flex min-h-[44px] flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-slate-700 hover:bg-secondary transition-colors"
          >
            <span>Cấu hình ca làm</span>
          </Link>
        </div>
      </div>

      {/* Owner Quick Summary Cards (Labor Cost Week/Month, Cash Discrepancy, Today Anomalies) */}
      <section
        aria-label="Thẻ tóm tắt nhanh cho Chủ quán"
        data-testid="owner-quick-summary"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <Card className="border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-white">
          <CardContent className="p-4 sm:p-5 flex flex-col justify-between gap-3 h-full">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Chi phí nhân sự ước tính
                </p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900 break-words">
                  {formatVnd(metrics.estimatedWeeklyLaborCostVnd)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    / tuần
                  </span>
                </p>
                <p className="text-xs text-slate-600">
                  Tháng này:{" "}
                  <strong className="text-slate-900">
                    {formatVnd(metrics.estimatedMonthlyLaborCostVnd)}
                  </strong>
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
            <Link
              href="/payroll"
              className="inline-flex min-h-[44px] items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              <span>Xem bảng lương &amp; dự toán</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          </CardContent>
        </Card>

        <Card
          className={
            hasCashDiscrepancy
              ? "border-amber-300 bg-gradient-to-br from-amber-50/70 to-white"
              : "border-slate-200 bg-gradient-to-br from-slate-50/70 to-white"
          }
        >
          <CardContent className="p-4 sm:p-5 flex flex-col justify-between gap-3 h-full">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Tổng chênh lệch két bàn giao
                </p>
                <p
                  className={`text-xl sm:text-2xl font-bold break-words ${
                    monthlyCashDiscrepancyBigInt < 0n
                      ? "text-red-700"
                      : hasCashDiscrepancy
                        ? "text-amber-700"
                        : "text-emerald-700"
                  }`}
                >
                  {formattedCashDiscrepancy}
                </p>
                <p className="text-xs text-slate-600">
                  Tháng này: {metrics.cashDiscrepancyCount} ca lệch két
                  {metrics.disputedHandoverCount > 0
                    ? ` • ${metrics.disputedHandoverCount} ca tranh chấp`
                    : monthlyCashDiscrepancyBigInt === 0n &&
                        monthlyCashDiscrepancyAbsBigInt > 0n
                      ? ` • Tổng lệch: ${formatVnd(monthlyCashDiscrepancyAbsBigInt)}`
                      : hasCashDiscrepancy
                        ? ""
                        : " • Két ổn định"}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Banknote className="h-5 w-5" />
              </div>
            </div>
            <Link
              href="/handovers"
              className="inline-flex min-h-[44px] items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 transition-colors"
            >
              <span>Kiểm tra biên bản bàn giao</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          </CardContent>
        </Card>

        <Card
          className={
            anomalyTotal > 0
              ? "border-red-300 bg-gradient-to-br from-red-50/70 to-white"
              : "border-emerald-200/80 bg-gradient-to-br from-emerald-50/40 to-white"
          }
        >
          <CardContent className="p-4 sm:p-5 flex flex-col justify-between gap-3 h-full">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                  Cảnh báo ca bất thường hôm nay
                </p>
                <p
                  className={`text-xl sm:text-2xl font-bold ${
                    anomalyTotal > 0 ? "text-red-700" : "text-emerald-700"
                  }`}
                >
                  {anomalyTotal} cảnh báo
                </p>
                <p className="text-xs text-slate-600">
                  {attendanceAlerts.lateOrNoShows.length} đi trễ / vắng (+15p) •{" "}
                  {attendanceAlerts.missingClockOuts.length} quên ra (+60p)
                </p>
              </div>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  anomalyTotal > 0
                    ? "bg-red-100 text-red-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                <ShieldAlert className="h-5 w-5" />
              </div>
            </div>
            <Link
              href="/attendance"
              className="inline-flex min-h-[44px] items-center justify-between rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors"
            >
              <span>Xử lý chấm công &amp; sửa giờ ra</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* Attendance Anomaly Alerts (+15m Late/No-Show & +60m Missing Clock-Out with 1-Tap Fix) */}
      <AttendanceAlertsPanel initialAlerts={attendanceAlerts} />

      {/* KPI Grid as clickable Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.title} href={kpi.href} className="block group">
              <Card className="h-full transition-all group-hover:border-emerald-500/50 group-hover:shadow-md cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground group-hover:text-emerald-700 transition-colors">
                        {kpi.title}
                      </p>
                      <p className="text-2xl font-bold text-slate-900">
                        {kpi.value}
                      </p>
                    </div>
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${kpi.accent} group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 flex items-center justify-between">
                    <span>{kpi.sub}</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-emerald-600 transition-opacity" />
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Bottom 2-column summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Phân bổ nhân sự theo vị trí &amp; kỹ năng</CardTitle>
              <CardDescription>
                Số lượng nhân sự chính thức và nhân sự kiêm nhiệm từng vị trí
              </CardDescription>
            </div>
            <Link
              href="/positions"
              className="text-xs font-medium text-emerald-700 hover:underline"
            >
              Xem tất cả
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.positionBreakdown.map((pos) => (
              <div
                key={pos.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Briefcase className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-sm font-medium text-slate-800 truncate">
                    {pos.name}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">{pos.primaryCount} chính</Badge>
                  <Badge variant="secondary">
                    {pos.skilledCount} có kỹ năng
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nhật ký hoạt động gần đây</CardTitle>
            <CardDescription>
              Các thao tác quan trọng được ghi nhận tự động trên hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.recentAuditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Chưa có nhật ký hoạt động nào được ghi nhận.
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.recentAuditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {log.action}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({log.entityType})
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        Thực hiện bởi: {log.actorEmail}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTimeVN(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

