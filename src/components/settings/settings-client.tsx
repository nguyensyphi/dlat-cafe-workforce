"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Save } from "lucide-react";
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMsg(payload?.error?.message ?? "Không thể lưu cài đặt");
        return;
      }
      setForm(payload.data);
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
          <Button type="submit" disabled={saving}>
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
      </div>
    </form>
  );
}

