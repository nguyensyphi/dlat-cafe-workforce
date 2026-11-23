"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  DollarSign,
  Lock,
  Plus,
  Users,
} from "lucide-react";
import { formatDateVN } from "@/lib/date";
import { formatVnd } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PayrollPeriodSummaryDto } from "@/modules/payroll/payroll.types";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "warning"; className?: string }> = {
  DRAFT: { label: "Bản nháp", variant: "outline" },
  CALCULATED: { label: "Đã tính toán", variant: "secondary" },
  REVIEWED: { label: "Đã rà soát", variant: "warning" },
  APPROVED: { label: "Đã phê duyệt", variant: "outline", className: "border-emerald-500 text-emerald-600" },
  PAID: { label: "Đã thanh toán", variant: "outline", className: "border-blue-500 text-blue-600 font-semibold" },
  LOCKED: { label: "Đã khóa sổ", variant: "default", className: "bg-gray-800 text-white" },
};

function toBigIntSafe(value: bigint | number | string | null | undefined): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim() !== "") return BigInt(value.trim());
  return 0n;
}

export function PayrollManagementClient({
  initialPeriods,
}: {
  initialPeriods: PayrollPeriodSummaryDto[];
}) {
  const router = useRouter();
  const [periods, setPeriods] = useState(initialPeriods);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Create Form State
  const [name, setName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [cutoffDate, setCutoffDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(1.5);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function applyPeriodPreset(preset: "PERIOD_1" | "PERIOD_2") {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    const monthStr = month < 10 ? `0${month}` : `${month}`;

    if (preset === "PERIOD_1") {
      setName(`Bảng lương Tháng ${monthStr}/${year} (Kỳ 1: 01-15)`);
      setPeriodStart(`${year}-${monthStr}-01`);
      setPeriodEnd(`${year}-${monthStr}-15`);
      setCutoffDate(`${year}-${monthStr}-15`);
      setPaymentDate(`${year}-${monthStr}-18`);
    } else {
      const lastDay = new Date(year, month, 0).getDate();
      setName(`Bảng lương Tháng ${monthStr}/${year} (Kỳ 2: 16-Hết tháng)`);
      setPeriodStart(`${year}-${monthStr}-16`);
      setPeriodEnd(`${year}-${monthStr}-${lastDay}`);
      setCutoffDate(`${year}-${monthStr}-${lastDay}`);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonthStr = nextMonth < 10 ? `0${nextMonth}` : `${nextMonth}`;
      setPaymentDate(`${nextYear}-${nextMonthStr}-03`);
    }
  }

  async function handleCreatePeriod(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    try {
      const res = await fetch("/api/payroll/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          periodStart,
          periodEnd,
          cutoffDate: cutoffDate || null,
          paymentDate: paymentDate || null,
          overtimeMultiplier: Number(overtimeMultiplier),
          notes: notes.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFormError(
          json.error?.message || json.message || "Không thể tạo kỳ lương mới",
        );
      } else {
        setPeriods([json.data, ...periods]);
        setCreateModalOpen(false);
        router.push(`/payroll/${json.data.id}`);
      }
    } catch {
      setFormError("Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  }

  // Aggregate stats
  const totalPaidOutVND = periods
    .filter((p) => p.status === "PAID" || p.status === "LOCKED")
    .reduce((acc, cur) => acc + toBigIntSafe(cur.totalPayrollVND), 0n);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý Bảng lương</h1>
          <p className="text-sm text-muted-foreground">
            Tính lương theo giờ công thực tế, quản lý hệ số tăng ca, phụ cấp, thưởng và khóa sổ kế toán
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="min-h-[44px] w-full sm:w-auto gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            <span>Tạo kỳ lương mới</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tổng số kỳ lương
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{periods.length}</div>
            <p className="text-xs text-muted-foreground">Các kỳ lương đã khởi tạo</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Kỳ đang mở / rà soát
            </CardTitle>
            <Users className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {periods.filter((p) => p.status !== "LOCKED" && p.status !== "PAID").length}
            </div>
            <p className="text-xs text-muted-foreground">Chờ duyệt hoặc thanh toán</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tổng quỹ lương đã chi
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatVnd(totalPaidOutVND)}
            </div>
            <p className="text-xs text-muted-foreground">Các kỳ đã thanh toán hoặc khóa</p>
          </CardContent>
        </Card>
      </div>

      {/* Periods List Table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Danh sách các Kỳ lương ({periods.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Chưa có kỳ lương nào. Nhấn &quot;Tạo kỳ lương mới&quot; để bắt đầu tính toán lương.
            </div>
          ) : (
            <>
              {/* Mobile Card View (< md) */}
              <div className="space-y-3 md:hidden">
                {periods.map((p) => {
                  const st = STATUS_LABELS[p.status] || {
                    label: p.status,
                    variant: "outline",
                  };
                  return (
                    <div
                      key={`mob-${p.id}`}
                      className="rounded-xl border border-border bg-white p-3.5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/payroll/${p.id}`}
                            className="font-semibold text-sm text-emerald-700 hover:underline block truncate"
                          >
                            {p.name}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDateVN(p.periodStart)} – {formatDateVN(p.periodEnd)}
                          </p>
                        </div>
                        <Badge variant={st.variant} className={st.className}>
                          {p.status === "LOCKED" && <Lock className="mr-1 h-3 w-3 inline" />}
                          {st.label}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Nhân sự</span>
                          <span className="font-semibold">{p.totalEmployees}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Giờ công</span>
                          <span className="font-semibold">{p.totalHours.toFixed(1)}h</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Quỹ lương</span>
                          <span className="font-bold text-emerald-700">
                            {formatVnd(p.totalPayrollVND)}
                          </span>
                        </div>
                      </div>

                      <Link href={`/payroll/${p.id}`} className="block">
                        <Button size="sm" variant="outline" className="min-h-[44px] w-full text-xs">
                          Xem chi tiết kỳ lương
                        </Button>
                      </Link>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View (>= md) */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="py-3 px-3">Tên kỳ lương</th>
                    <th className="py-3 px-3">Khoảng thời gian</th>
                    <th className="py-3 px-3 text-right">Số nhân viên</th>
                    <th className="py-3 px-3 text-right">Tổng giờ công</th>
                    <th className="py-3 px-3 text-right">Tổng quỹ lương (VND)</th>
                    <th className="py-3 px-3 text-center">Trạng thái</th>
                    <th className="py-3 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {periods.map((p) => {
                    const st = STATUS_LABELS[p.status] || {
                      label: p.status,
                      variant: "outline",
                    };
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="py-3 px-3">
                          <Link
                            href={`/payroll/${p.id}`}
                            className="font-medium text-emerald-600 hover:underline"
                          >
                            {p.name}
                          </Link>
                          {p.paymentDate && (
                            <div className="text-xs text-muted-foreground">
                              Ngày chi trả: {formatDateVN(p.paymentDate)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-muted-foreground">
                          {formatDateVN(p.periodStart)} – {formatDateVN(p.periodEnd)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium">
                          {p.totalEmployees}
                        </td>
                        <td className="py-3 px-3 text-right font-medium">
                          {p.totalHours.toFixed(2)}h
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-foreground">
                          {formatVnd(p.totalPayrollVND)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant={st.variant} className={st.className}>
                            {p.status === "LOCKED" && <Lock className="mr-1 h-3 w-3 inline" />}
                            {st.label}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link href={`/payroll/${p.id}`}>
                            <Button size="sm" variant="outline" className="h-8 text-xs">
                              Chi tiết
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal: Create Payroll Period */}
      {createModalOpen && (
        <Dialog open onOpenChange={setCreateModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Tạo Kỳ lương Mới</DialogTitle>
              <DialogDescription>
                Thiết lập khoảng thời gian tính lương theo giờ cho toàn bộ nhân sự quán
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreatePeriod} className="space-y-4 pt-2">
              {formError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-50/50 p-2.5 dark:bg-emerald-950/20">
                <Label className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  Chọn nhanh chu kỳ D&apos;Lat (2 kỳ/tháng):
                </Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyPeriodPreset("PERIOD_1")}
                    className="flex-1 text-xs border-emerald-500/40 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium h-8"
                  >
                    ⚡ Kỳ 1 (01 - 15)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyPeriodPreset("PERIOD_2")}
                    className="flex-1 text-xs border-emerald-500/40 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium h-8"
                  >
                    ⚡ Kỳ 2 (16 - Cuối tháng)
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="period-name">Tên kỳ lương:</Label>
                <Input
                  id="period-name"
                  required
                  placeholder="Ví dụ: Bảng lương Tháng 11/2026 (Đợt 1)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="start-date">Từ ngày:</Label>
                  <Input
                    id="start-date"
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="end-date">Đến ngày:</Label>
                  <Input
                    id="end-date"
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cutoff-date">Ngày chốt công:</Label>
                  <Input
                    id="cutoff-date"
                    type="date"
                    value={cutoffDate}
                    onChange={(e) => setCutoffDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="payment-date">Ngày chi trả:</Label>
                  <Input
                    id="payment-date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="ot-mult">Hệ số tính lương tăng ca (Overtime Multiplier):</Label>
                <Input
                  id="ot-mult"
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="3.0"
                  value={overtimeMultiplier}
                  onChange={(e) => setOvertimeMultiplier(Number(e.target.value))}
                />
                <span className="text-[11px] text-muted-foreground">
                  Mặc định 1.5x (theo quy chế tiền lương ngoài giờ)
                </span>
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes">Ghi chú kỳ lương:</Label>
                <Input
                  id="notes"
                  placeholder="Ghi chú nội bộ..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {loading ? "Đang tạo..." : "Khởi tạo Kỳ lương"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
