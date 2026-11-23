"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      const json = await res.json();
      if (json.ok) {
        setUnreadCount(json.data.unreadCount);
        setItems(json.data.items);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 45000); // Polling every 45s
    return () => clearInterval(interval);
  }, []);

  async function markAsRead(id: string) {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  }

  async function markAllAsRead() {
    setLoading(true);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none"
        title="Thông báo"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-3 right-3 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-slate-50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-900">
                Thông báo
              </span>
              {unreadCount > 0 && (
                <Badge variant="default" className="text-[10px] py-0 px-1.5">
                  {unreadCount} mới
                </Badge>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={loading}
                className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1"
              >
                <CheckCheck className="h-3 w-3" />
                <span>Đã đọc tất cả</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {items.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Không có thông báo nào
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 text-xs transition-colors ${
                    !item.isRead ? "bg-emerald-50/40" : "bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {item.createdAt.slice(11, 16)} {item.createdAt.slice(8, 10)}/{item.createdAt.slice(5, 7)}
                    </span>
                  </div>

                  <p className="text-slate-600 mt-1 line-clamp-2">
                    {item.message}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-1">
                    {item.linkUrl ? (
                      <Link
                        href={item.linkUrl}
                        onClick={() => {
                          if (!item.isRead) markAsRead(item.id);
                          setOpen(false);
                        }}
                        className="text-[11px] font-medium text-emerald-700 hover:underline"
                      >
                        Xem chi tiết &rarr;
                      </Link>
                    ) : (
                      <span />
                    )}

                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={() => markAsRead(item.id)}
                        className="text-[10px] text-slate-500 hover:text-slate-800"
                        title="Đánh dấu đã đọc"
                      >
                        Đã đọc
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
