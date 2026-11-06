import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  Clock,
  DollarSign,
  FileWarning,
  RefreshCw,
  UserCheck,
  Users,
} from "lucide-react";
import { requireServerSession } from "@/lib/auth";
import { formatVnd } from "@/lib/currency";
import { formatDateTimeVN } from "@/lib/date";
import { dashboardService } from "@/modules/dashboard/dashboard.service";
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
  const metrics = await dashboardService.getManagementMetrics(actor);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <span>Quản lý nhân sự</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/shifts"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-slate-700 hover:bg-secondary transition-colors"
          >
            <span>Cấu hình ca làm</span>
          </Link>
        </div>
      </div>

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
                className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <Briefcase className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-slate-800">
                    {pos.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
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

