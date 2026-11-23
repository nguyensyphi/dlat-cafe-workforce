"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Calendar,
  ClipboardCheck,
  Clock,
  Coffee,
  DollarSign,
  FileText,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Menu,
  QrCode,
  Settings,
  Shield,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import type { SessionUser } from "@/lib/jwt";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ChangePasswordPinModal } from "@/components/auth/change-password-pin-modal";
import { LogoutButton } from "./logout-button";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Tổng quan",
    icon: LayoutDashboard,
  },
  {
    href: "/schedules",
    label: "Lịch làm việc",
    icon: Calendar,
  },
  {
    href: "/attendance",
    label: "Chấm công",
    icon: QrCode,
  },
  {
    href: "/handovers",
    label: "Bàn giao ca",
    icon: ClipboardCheck,
  },
  {
    href: "/payroll",
    label: "Bảng lương",
    icon: DollarSign,
  },
  {
    href: "/requests",
    label: "Duyệt đơn",
    icon: FileText,
  },
  {
    href: "/reports",
    label: "Báo cáo",
    icon: BarChart3,
  },
  {
    href: "/employees",
    label: "Nhân sự",
    icon: Users,
  },
  {
    href: "/positions",
    label: "Vị trí & Kỹ năng",
    icon: Briefcase,
  },
  {
    href: "/shifts",
    label: "Cấu hình ca",
    icon: Clock,
  },
  {
    href: "/audit",
    label: "Nhật ký hệ thống",
    icon: Shield,
    ownerOnly: true,
  },
  {
    href: "/settings",
    label: "Cài đặt quán",
    icon: Settings,
  },
];

const ROLE_LABELS: Record<SessionUser["role"], string> = {
  OWNER: "Chủ quán",
  MANAGER: "Quản lý",
  EMPLOYEE: "Nhân viên",
};

export function ManagementShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [targetHref, setTargetHref] = useState<string | null>(null);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setTargetHref(null);
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleNavClick = (href: string) => {
    if (href !== pathname) {
      setTargetHref(href);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Top Global Navigation Progress Bar */}
      {targetHref && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-emerald-600 z-50 overflow-hidden">
          <div className="h-full bg-emerald-300 animate-pulse w-full" />
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card z-30">
        <div className="flex h-16 items-center gap-3 px-5 border-b border-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Coffee className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-none">
              D&apos;lat Cafe
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Quản lý Nhân sự &amp; Ca
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {NAV_ITEMS.filter((item) => !item.ownerOnly || user.role === "OWNER").map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const isPendingNav = targetHref === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer select-none",
                  active
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-sm"
                    : isPendingNav
                      ? "bg-slate-100 text-emerald-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {isPendingNav ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
                ) : (
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-emerald-600" : "text-slate-400",
                    )}
                  />
                )}
                <span>{item.label}</span>
                {isPendingNav && (
                  <span className="ml-auto text-[10px] text-emerald-600 animate-pulse font-normal">
                    Đang mở...
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4 space-y-2">
          <Link
            href="/employee/profile"
            onClick={() => handleNavClick("/employee/profile")}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
          >
            <UserCircle className="h-4 w-4 text-slate-400" />
            <span className="truncate">Hồ sơ cá nhân của tôi</span>
          </Link>
          <button
            type="button"
            onClick={() => setSecurityModalOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 text-left"
          >
            <KeyRound className="h-4 w-4 text-slate-400" />
            <span className="truncate">Đổi mật khẩu &amp; PIN</span>
          </button>
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {user.fullName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
            <Badge variant="default">{ROLE_LABELS[user.role]}</Badge>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0 min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card/95 backdrop-blur px-3 sm:px-6 gap-2">
          <div className="flex items-center gap-2 md:hidden min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu quản lý"
              title="Menu quản lý"
              className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-card text-slate-700 hover:bg-slate-100 shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Coffee className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-slate-900 truncate">
              D&apos;lat Cafe
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <span>Múi giờ: Asia/Ho_Chi_Minh</span>
            <span>•</span>
            <span>Đơn vị tiền tệ: VND (₫)</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <NotificationBell />
            <button
              type="button"
              onClick={() => setSecurityModalOpen(true)}
              title="Đổi mật khẩu & Mã PIN"
              aria-label="Đổi mật khẩu và mã PIN"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-0"
            >
              <KeyRound className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="hidden lg:inline">Đổi MK / PIN</span>
            </button>
            <Badge variant="outline" className="hidden sm:inline-flex">
              {ROLE_LABELS[user.role]}: {user.fullName}
            </Badge>
            <LogoutButton compact />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex md:hidden items-center justify-around border-t border-border bg-card min-h-[64px] pb-[env(safe-area-inset-bottom,0px)] px-1">
        {NAV_ITEMS.filter((item) => ["/dashboard", "/schedules", "/attendance", "/handovers", "/payroll"].includes(item.href)).map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isPendingNav = targetHref === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => handleNavClick(item.href)}
              className={cn(
                "flex flex-1 min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer",
                active ? "text-emerald-700 font-semibold" : "text-slate-500",
              )}
            >
              {isPendingNav ? (
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              ) : (
                <Icon
                  className={cn(
                    "h-5 w-5",
                    active ? "text-emerald-600" : "text-slate-400",
                  )}
                />
              )}
              <span className="truncate max-w-[68px]">
                {isPendingNav ? "Đang tải..." : item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile Slide-Over Menu Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu điều hướng quản lý"
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-card shadow-2xl border-r border-border h-full">
            <div className="flex h-16 items-center justify-between px-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <Coffee className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 leading-none">
                    D&apos;lat Cafe
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {ROLE_LABELS[user.role]}: {user.fullName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Đóng menu"
                className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
              {NAV_ITEMS.filter(
                (item) => !item.ownerOnly || user.role === "OWNER",
              ).map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      handleNavClick(item.href);
                      setMobileMenuOpen(false);
                    }}
                    className={cn(
                      "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/70"
                        : "text-slate-700 hover:bg-slate-100",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-emerald-600" : "text-slate-400",
                      )}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border p-3 space-y-1.5">
              <Link
                href="/employee/profile"
                onClick={() => {
                  handleNavClick("/employee/profile");
                  setMobileMenuOpen(false);
                }}
                className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                <UserCircle className="h-4 w-4 text-slate-400" />
                <span>Hồ sơ cá nhân</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSecurityModalOpen(true);
                }}
                className="w-full flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 text-left"
              >
                <KeyRound className="h-4 w-4 text-emerald-600" />
                <span>Đổi mật khẩu &amp; PIN</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ChangePasswordPinModal
        open={securityModalOpen}
        onOpenChange={setSecurityModalOpen}
        hasEmployeeProfile={Boolean(user.employeeId)}
      />
    </div>
  );
}

