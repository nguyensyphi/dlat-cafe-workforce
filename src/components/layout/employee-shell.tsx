"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Clock, Coffee, DollarSign, FileText, LayoutDashboard, QrCode, UserCircle } from "lucide-react";
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
  const isManagerOrOwner = user.role === "OWNER" || user.role === "MANAGER";

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

  return (
    <div className="min-h-screen bg-background flex flex-col pb-16 sm:pb-0">
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

      <nav className="fixed bottom-0 inset-x-0 z-30 flex sm:hidden items-center justify-around border-t border-border bg-card h-16 px-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg text-xs font-medium",
                active ? "text-emerald-700" : "text-slate-500",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  active ? "text-emerald-600" : "text-slate-400",
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

