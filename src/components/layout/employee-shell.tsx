"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ClipboardCheck,
  Clock,
  Coffee,
  DollarSign,
  FileText,
  LayoutDashboard,
  Loader2,
  QrCode,
  UserCircle,
} from "lucide-react";
import type { SessionUser } from "@/lib/jwt";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LogoutButton } from "./logout-button";

export function EmployeeShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [targetHref, setTargetHref] = useState<string | null>(null);

  useEffect(() => {
    setTargetHref(null);
  }, [pathname]);

  const handleNavClick = (href: string) => {
    if (href !== pathname) {
      setTargetHref(href);
    }
  };

  const isManagerOrOwner = user.role === "OWNER" || user.role === "MANAGER";

  // Desktop header items (7 items)
  const navItems = [
    {
      href: "/employee/schedule",
      label: "Lịch làm",
      icon: Calendar,
    },
    {
      href: "/employee/availability",
      label: "Đăng ký rảnh",
      icon: Clock,
    },
    {
      href: "/employee/attendance",
      label: "Chấm công",
      icon: QrCode,
    },
    {
      href: "/employee/handover",
      label: "Bàn giao ca",
      icon: ClipboardCheck,
    },
    {
      href: "/employee/requests",
      label: "Đơn & Đổi ca",
      icon: FileText,
    },
    {
      href: "/employee/payroll",
      label: "Phiếu lương",
      icon: DollarSign,
    },
    {
      href: "/employee/profile",
      label: "Hồ sơ của tôi",
      icon: UserCircle,
    },
    ...(isManagerOrOwner
      ? [
          {
            href: "/dashboard",
            label: "Trang quản lý",
            icon: LayoutDashboard,
          },
        ]
      : []),
  ];

  // Mobile bottom bar items: 5 core daily items, no overcrowding
  const mobileNavItems = [
    {
      href: "/employee/schedule",
      label: "Lịch làm",
      icon: Calendar,
    },
    {
      href: "/employee/attendance",
      label: "Chấm công",
      icon: QrCode,
    },
    {
      href: "/employee/handover",
      label: "Bàn giao",
      icon: ClipboardCheck,
    },
    {
      href: "/employee/payroll",
      label: "Lương",
      icon: DollarSign,
    },
    {
      href: "/employee/profile",
      label: "Cá nhân",
      icon: UserCircle,
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col pb-16 sm:pb-0">
      {targetHref && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-emerald-600 z-50 overflow-hidden">
          <div className="h-full bg-emerald-300 animate-pulse w-full" />
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Coffee className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-none">
              D&apos;lat Cafe — Cổng Nhân viên
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Xin chào, {user.fullName}
            </p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const isPendingNav = targetHref === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  active
                    ? "bg-emerald-50 text-emerald-700 font-semibold"
                    : isPendingNav
                      ? "bg-slate-100 text-emerald-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {isPendingNav ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          <NotificationBell />
          {isManagerOrOwner && (
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Quản lý quán</span>
            </Link>
          )}
          <Badge variant="default" className="hidden xs:inline-flex">
            Nhân sự
          </Badge>
          <LogoutButton compact />
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-3xl w-full mx-auto">
        {children}
      </main>

      {/* Mobile Bottom Navigation: 5 items */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex md:hidden items-center justify-around border-t border-border bg-card/95 backdrop-blur h-16 px-1 shadow-lg">
        {mobileNavItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isPendingNav = targetHref === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onClick={() => handleNavClick(item.href)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
                active ? "text-emerald-700 font-semibold" : "text-slate-500 hover:text-slate-900",
              )}
            >
              {isPendingNav ? (
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              ) : (
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    active ? "text-emerald-600" : "text-slate-400",
                  )}
                />
              )}
              <span className="truncate max-w-[64px]">
                {isPendingNav ? "..." : item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
