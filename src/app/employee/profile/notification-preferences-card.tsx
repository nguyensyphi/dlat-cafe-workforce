"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Save } from "lucide-react";
import type { NotificationPreferences } from "@/modules/notifications/notification.validation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NotificationPreferencesCard({
  initialTelegramChatId,
  initialZaloUserId,
  initialPreferences,
}: {
  initialTelegramChatId: string | null;
  initialZaloUserId: string | null;
  initialPreferences: NotificationPreferences;
}) {
  const router = useRouter();
  const [telegramChatId, setTelegramChatId] = useState(
    initialTelegramChatId ?? "",
  );
  const [zaloUserId, setZaloUserId] = useState(initialZaloUserId ?? "");
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/profile/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramChatId: telegramChatId.trim() || null,
          zaloUserId: zaloUserId.trim() || null,
          notificationPreferences: preferences,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMsg(
          payload?.error?.message ?? "Không thể cập nhật cài đặt thông báo",
        );
        return;
      }
      setTelegramChatId(payload.data.telegramChatId ?? "");
      setZaloUserId(payload.data.zaloUserId ?? "");
      setPreferences(payload.data.notificationPreferences);
      setSuccessMsg("Đã lưu thông tin liên hệ và kênh nhận thông báo");
      router.refresh();
    } catch {
      setErrorMsg("Mất kết nối mạng. Vui lòng thử lại khi trực tuyến.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-emerald-600" />
          <span>Cài đặt nhận thông báo đa kênh</span>
        </CardTitle>
        <CardDescription>
          Cập nhật Telegram Chat ID, Zalo User ID và bật/tắt kênh nhận thông báo
          lịch ca, đơn nghỉ và nhắc ca
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          {successMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="self-telegram-chat-id">Telegram Chat ID</Label>
              <Input
                id="self-telegram-chat-id"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="VD: 123456789"
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="self-zalo-user-id">Zalo User ID (OA)</Label>
              <Input
                id="self-zalo-user-id"
                value={zaloUserId}
                onChange={(e) => setZaloUserId(e.target.value)}
                placeholder="VD: 4123456789012345"
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Kênh nhận thông báo ưu tiên</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-sm font-medium cursor-pointer min-h-[44px]">
                <input
                  id="self-pref-telegram"
                  type="checkbox"
                  checked={preferences.telegram}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      telegram: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Telegram Bot</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-sm font-medium cursor-pointer min-h-[44px]">
                <input
                  id="self-pref-zalo"
                  type="checkbox"
                  checked={preferences.zalo}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      zalo: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Zalo ZNS / OA</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-sm font-medium cursor-pointer min-h-[44px]">
                <input
                  id="self-pref-email"
                  type="checkbox"
                  checked={preferences.email}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      email: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Email cá nhân</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto min-h-[44px]"
            >
              <Save className="h-4 w-4" />
              <span>
                {saving ? "Đang lưu..." : "Lưu cài đặt thông báo"}
              </span>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
