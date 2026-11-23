"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save, Send } from "lucide-react";
import type { UserRole } from "@prisma/client";
import type { SystemSettingsBundle } from "@/modules/settings/settings.service";
import { hasPermission } from "@/lib/permissions";
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

export function SettingsClient({
  initialSettings,
  actorRole,
}: {
  initialSettings: SystemSettingsBundle;
  actorRole: UserRole;
}) {
  const router = useRouter();
  const canWrite = hasPermission(actorRole, "settings:write");
  const [form, setForm] = useState<SystemSettingsBundle>(initialSettings);
  const [managerChatIdsText, setManagerChatIdsText] = useState<string>(
    initialSettings.notificationPolicy.managerTelegramChatIds.join(", "),
  );
  const [saving, setSaving] = useState(false);
  const [testingNotif, setTestingNotif] = useState(false);
  const [testResult, setTestResult] = useState<{
    sent: number;
    skipped: number;
    failed: number;
    results: Array<{
      channel: string;
      status: "SENT" | "SKIPPED" | "FAILED";
      target?: string | null;
      reason?: string;
    }>;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleTestNotification() {
    setTestingNotif(true);
    setTestResult(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/settings/test-notification", {
        method: "POST",
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMsg(payload?.error?.message ?? "Không thể gửi thử thông báo");
        return;
      }
      setTestResult(payload.data);
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ khi gửi thử thông báo");
    } finally {
      setTestingNotif(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      const parsedManagerChatIds = managerChatIdsText
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      const payloadToSave: SystemSettingsBundle = {
        ...form,
        notificationPolicy: {
          ...form.notificationPolicy,
          managerTelegramChatIds: parsedManagerChatIds,
        },
      };

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSave),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMsg(payload?.error?.message ?? "Không thể lưu cài đặt");
        return;
      }
      setForm(payload.data);
      setManagerChatIdsText(
        payload.data.notificationPolicy.managerTelegramChatIds.join(", "),
      );
      setMessage("Đã cập nhật cài đặt vận hành quán thành công");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Cài đặt hệ thống &amp; Chính sách quán
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tất cả thông số giới hạn giờ làm, hiệu lực QR chấm công và hệ số
            tăng ca đều được cấu hình động tại đây
          </p>
        </div>

        {canWrite && (
          <Button type="submit" disabled={saving} className="min-h-[44px] w-full sm:w-auto">
            <Save className="h-4 w-4" />
            <span>{saving ? "Đang lưu..." : "Lưu thay đổi"}</span>
          </Button>
        )}
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin cửa hàng</CardTitle>
            <CardDescription>
              Hiển thị trên phiếu lương, màn hình Kiosk QR và báo cáo xuất file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="shop-name">Tên quán cà phê</Label>
              <Input
                id="shop-name"
                disabled={!canWrite}
                value={form.shopProfile.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shopProfile: { ...form.shopProfile, name: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shop-addr">Địa chỉ</Label>
              <Input
                id="shop-addr"
                disabled={!canWrite}
                value={form.shopProfile.address}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shopProfile: {
                      ...form.shopProfile,
                      address: e.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shop-phone">Số điện thoại liên hệ</Label>
              <Input
                id="shop-phone"
                disabled={!canWrite}
                value={form.shopProfile.phone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shopProfile: { ...form.shopProfile, phone: e.target.value },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chính sách xếp ca &amp; giờ làm</CardTitle>
            <CardDescription>
              Áp dụng cho cả kiểm tra thủ công lẫn thuật toán xếp ca tự động
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="min-rest">Nghỉ tối thiểu giữa 2 ca (giờ)</Label>
              <Input
                id="min-rest"
                type="number"
                disabled={!canWrite}
                value={form.schedulingPolicy.minRestHours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    schedulingPolicy: {
                      ...form.schedulingPolicy,
                      minRestHours: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-wk">Trần giờ tối đa mặc định / tuần</Label>
              <Input
                id="max-wk"
                type="number"
                disabled={!canWrite}
                value={form.schedulingPolicy.maxWeeklyHours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    schedulingPolicy: {
                      ...form.schedulingPolicy,
                      maxWeeklyHours: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-consec">Số ngày làm liên tiếp tối đa</Label>
              <Input
                id="max-consec"
                type="number"
                disabled={!canWrite}
                value={form.schedulingPolicy.maxConsecutiveDays}
                onChange={(e) =>
                  setForm({
                    ...form,
                    schedulingPolicy: {
                      ...form.schedulingPolicy,
                      maxConsecutiveDays: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-days">
                Hạn đóng đăng ký lịch trước tuần mới (ngày)
              </Label>
              <Input
                id="lead-days"
                type="number"
                disabled={!canWrite}
                value={form.schedulingPolicy.availabilityLeadDays}
                onChange={(e) =>
                  setForm({
                    ...form,
                    schedulingPolicy: {
                      ...form.schedulingPolicy,
                      availabilityLeadDays: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chính sách Chấm công QR</CardTitle>
            <CardDescription>
              Thời hạn mã QR động tại quầy và ngưỡng đi trễ cho phép
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qr-ttl">Chu kỳ làm mới QR (giây)</Label>
              <Input
                id="qr-ttl"
                type="number"
                disabled={!canWrite}
                value={form.attendancePolicy.qrExpirySeconds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    attendancePolicy: {
                      ...form.attendancePolicy,
                      qrExpirySeconds: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="late-grace">Ân hạn đi trễ (phút)</Label>
              <Input
                id="late-grace"
                type="number"
                disabled={!canWrite}
                value={form.attendancePolicy.lateGraceMinutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    attendancePolicy: {
                      ...form.attendancePolicy,
                      lateGraceMinutes: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="early-in">Cho phép vào sớm trước ca (phút)</Label>
              <Input
                id="early-in"
                type="number"
                disabled={!canWrite}
                value={form.attendancePolicy.earlyClockInMinutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    attendancePolicy: {
                      ...form.attendancePolicy,
                      earlyClockInMinutes: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chính sách Lương &amp; Tăng ca</CardTitle>
            <CardDescription>
              Cấu hình linh hoạt theo quy định hiện hành, không cố định cứng
              trong mã nguồn
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ot-mult">Hệ số nhân giờ tăng ca</Label>
              <Input
                id="ot-mult"
                type="number"
                step="0.1"
                disabled={!canWrite}
                value={form.payrollPolicy.overtimeMultiplier}
                onChange={(e) =>
                  setForm({
                    ...form,
                    payrollPolicy: {
                      ...form.payrollPolicy,
                      overtimeMultiplier: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-thresh">Ngưỡng tính tăng ca tuần (giờ)</Label>
              <Input
                id="ot-thresh"
                type="number"
                disabled={!canWrite}
                value={form.payrollPolicy.overtimeWeeklyThresholdHours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    payrollPolicy: {
                      ...form.payrollPolicy,
                      overtimeWeeklyThresholdHours: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Chính sách Thông báo &amp; Cảnh báo đa kênh</CardTitle>
            <CardDescription>
              Cấu hình kênh gửi Telegram, Zalo, Email và ngưỡng cảnh báo tự động
              (nhắc ca &amp; chênh lệch tiền két)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-sm font-medium cursor-pointer min-h-[44px]">
                <input
                  id="notif-enable-telegram"
                  type="checkbox"
                  disabled={!canWrite}
                  checked={form.notificationPolicy.enableTelegram}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notificationPolicy: {
                        ...form.notificationPolicy,
                        enableTelegram: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Bật gửi qua Telegram Bot</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-sm font-medium cursor-pointer min-h-[44px]">
                <input
                  id="notif-enable-zalo"
                  type="checkbox"
                  disabled={!canWrite}
                  checked={form.notificationPolicy.enableZalo}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notificationPolicy: {
                        ...form.notificationPolicy,
                        enableZalo: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Bật gửi qua Zalo ZNS / OA</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-sm font-medium cursor-pointer min-h-[44px]">
                <input
                  id="notif-enable-email"
                  type="checkbox"
                  disabled={!canWrite}
                  checked={form.notificationPolicy.enableEmail}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notificationPolicy: {
                        ...form.notificationPolicy,
                        enableEmail: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Bật gửi qua Email (SMTP / Resend)</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="notif-group-tg">
                  Telegram Chat ID nhóm vận hành quán
                </Label>
                <Input
                  id="notif-group-tg"
                  disabled={!canWrite}
                  placeholder="VD: -1001234567890"
                  value={form.notificationPolicy.groupTelegramChatId ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notificationPolicy: {
                        ...form.notificationPolicy,
                        groupTelegramChatId: e.target.value || null,
                      },
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notif-mgr-tg">
                  Danh sách Telegram Chat ID Quản lý (phân cách bởi dấu phẩy)
                </Label>
                <Input
                  id="notif-mgr-tg"
                  disabled={!canWrite}
                  placeholder="VD: 123456789, 987654321"
                  value={managerChatIdsText}
                  onChange={(e) => setManagerChatIdsText(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="notif-start-rem">
                  Nhắc trước giờ vào ca (phút)
                </Label>
                <Input
                  id="notif-start-rem"
                  type="number"
                  min={0}
                  max={180}
                  disabled={!canWrite}
                  value={form.notificationPolicy.shiftStartReminderMinutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notificationPolicy: {
                        ...form.notificationPolicy,
                        shiftStartReminderMinutes: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notif-end-rem">
                  Nhắc trước giờ tan ca (phút)
                </Label>
                <Input
                  id="notif-end-rem"
                  type="number"
                  min={0}
                  max={180}
                  disabled={!canWrite}
                  value={form.notificationPolicy.shiftEndReminderMinutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notificationPolicy: {
                        ...form.notificationPolicy,
                        shiftEndReminderMinutes: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notif-cash-thresh">
                  Ngưỡng cảnh báo chênh lệch tiền két (VND)
                </Label>
                <Input
                  id="notif-cash-thresh"
                  type="number"
                  min={0}
                  step={1000}
                  disabled={!canWrite}
                  value={form.notificationPolicy.cashDiscrepancyThresholdVnd}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notificationPolicy: {
                        ...form.notificationPolicy,
                        cashDiscrepancyThresholdVnd: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </div>

            {canWrite && (
              <div className="pt-3 border-t border-border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Sau khi điền token trong tệp <code>.env</code> và lưu cài đặt, bấm gửi thử để kiểm tra kết nối thực tế.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testingNotif}
                    onClick={handleTestNotification}
                    className="gap-1.5 min-h-[44px] w-full sm:w-auto"
                  >
                    {testingNotif ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span>{testingNotif ? "Đang gửi thử..." : "Gửi thử thông báo"}</span>
                  </Button>
                </div>

                {testResult && (
                  <div className="rounded-lg border border-border bg-slate-50 p-3 text-xs space-y-2">
                    <div className="font-semibold text-slate-800">
                      Kết quả gửi thử: {testResult.sent} thành công · {testResult.skipped} bỏ qua (chưa cấu hình) · {testResult.failed} lỗi
                    </div>
                    <div className="space-y-1">
                      {testResult.results.map((r, idx) => (
                        <div
                          key={`${r.channel}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 border border-border/60"
                        >
                          <span className="font-medium uppercase text-slate-700">
                            {r.channel}
                            {r.target ? ` (${r.target})` : ""}
                          </span>
                          <span
                            className={
                              r.status === "SENT"
                                ? "font-semibold text-emerald-700"
                                : r.status === "SKIPPED"
                                  ? "font-medium text-amber-700"
                                  : "font-semibold text-red-700"
                            }
                          >
                            {r.status}
                            {r.reason ? ` — ${r.reason}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

