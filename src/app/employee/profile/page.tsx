import Link from "next/link";
import {
  Briefcase,
  Calendar,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  LayoutDashboard,
  Phone,
} from "lucide-react";
import type { SkillProficiency } from "@prisma/client";
import { requireServerSession } from "@/lib/auth";
import { formatVnd } from "@/lib/currency";
import { DAY_OF_WEEK_LABELS_VN, formatDateVN } from "@/lib/date";
import { employeeService } from "@/modules/employees/employee.service";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NotificationPreferencesCard } from "./notification-preferences-card";
import { SecurityCredentialsCard } from "./security-credentials-card";

const PROFICIENCY_LABELS: Record<SkillProficiency, string> = {
  BASIC: "Cơ bản",
  INTERMEDIATE: "Thành thạo",
  ADVANCED: "Nâng cao",
};

export default async function EmployeeSelfProfilePage() {
  const actor = await requireServerSession("self:profile");

  if (!actor.employeeId) {
    const selfNotif = await employeeService.getSelfNotificationSettings(actor);
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Tài khoản chưa liên kết hồ sơ nhân sự</CardTitle>
            <CardDescription>
              Vui lòng liên hệ Chủ quán để khởi tạo mã nhân viên cho tài khoản{" "}
              {actor.email}.
            </CardDescription>
          </CardHeader>
        </Card>
        <SecurityCredentialsCard hasEmployeeProfile={false} />
        <NotificationPreferencesCard
          initialTelegramChatId={selfNotif.telegramChatId}
          initialZaloUserId={selfNotif.zaloUserId}
          initialPreferences={selfNotif.notificationPreferences}
        />
      </div>
    );
  }

  const profile = await employeeService.getEmployeeById(actor, actor.employeeId);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                {profile.fullName}
              </h1>
              <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {profile.employeeCode}
              </code>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {profile.email}
            </p>
          </div>
          <Badge variant="default">Đang làm việc</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-border text-sm">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" /> Chức vụ chính
            </p>
            <p className="font-semibold text-slate-900">
              {profile.primaryPosition.name}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" /> Đơn giá giờ
            </p>
            <p className="font-semibold text-emerald-700">
              {formatVnd(profile.currentHourlyRate)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Mục tiêu tuần
            </p>
            <p className="font-semibold text-slate-900">
              {profile.weeklyTargetHours} giờ / tuần
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Ngày vào làm
            </p>
            <p className="font-semibold text-slate-900">
              {formatDateVN(profile.hireDate)}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Navigation Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/employee/availability"
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-slate-50 transition-colors shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Đăng ký thời gian rảnh
              </p>
              <p className="text-xs text-muted-foreground">
                Gửi lịch rảnh các ngày trong tuần tới cho Quản lý
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>

        <Link
          href="/employee/requests"
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-slate-50 transition-colors shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Đơn xin nghỉ &amp; Đổi ca
              </p>
              <p className="text-xs text-muted-foreground">
                Tạo yêu cầu nghỉ phép hoặc đổi ca với đồng nghiệp
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>

        {(actor.role === "OWNER" || actor.role === "MANAGER") && (
          <Link
            href="/dashboard"
            className="sm:col-span-2 flex items-center justify-between p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/60 transition-colors shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-950">
                  Truy cập Trang Quản lý quán
                </p>
                <p className="text-xs text-emerald-800">
                  Xem bảng điều khiển, xếp ca tuần, duyệt công và quản lý tài chính
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-emerald-700" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Vị trí &amp; Kỹ năng được phân công</CardTitle>
            <CardDescription>
              Các vị trí bạn có thể đứng ca tại D&apos;lat Cafe
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {profile.skills.map((sk) => (
              <Badge key={sk.positionId} variant="outline" className="py-1">
                {sk.positionName} ({PROFICIENCY_LABELS[sk.proficiency]})
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin liên hệ &amp; Ngày nghỉ</CardTitle>
            <CardDescription>
              Thông tin cá nhân đã đăng ký với quản lý quán
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Số điện thoại:
              </span>
              <span className="font-medium text-slate-900">{profile.phone}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Ngày nghỉ cố định:</span>
              <span className="font-medium text-slate-900">
                {profile.fixedRestDay === null
                  ? "Linh hoạt"
                  : DAY_OF_WEEK_LABELS_VN[profile.fixedRestDay]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Trần giờ tối đa/tuần:</span>
              <span className="font-medium text-slate-900">
                {profile.maxWeeklyHours} giờ
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <SecurityCredentialsCard hasEmployeeProfile={true} />

      <NotificationPreferencesCard
        initialTelegramChatId={profile.telegramChatId}
        initialZaloUserId={profile.zaloUserId}
        initialPreferences={profile.notificationPreferences}
      />

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử đơn giá lương cá nhân</CardTitle>
          <CardDescription>
            Chỉ cá nhân bạn, Quản lý và Chủ quán được phép xem thông tin này
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {profile.payRates.map((rate) => (
            <div
              key={rate.id}
              className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5 text-sm"
            >
              <div>
                <p className="font-semibold text-emerald-700">
                  {formatVnd(rate.hourlyRate)} / giờ
                </p>
                <p className="text-xs text-muted-foreground">
                  Áp dụng từ {formatDateVN(rate.effectiveFrom)}
                  {rate.effectiveTo ? ` đến ${formatDateVN(rate.effectiveTo)}` : ""}
                </p>
              </div>
              {!rate.effectiveTo && <Badge variant="default">Hiện tại</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

