"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Download,
  Edit3,
  Lock,
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
import type {
  PayrollItemDto,
  PayrollPeriodDetailDto,
} from "@/modules/payroll/payroll.types";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "warning"; className?: string }> = {
  DRAFT: { label: "Bản nháp", variant: "outline" },
  CALCULATED: { label: "Đã tính toán", variant: "secondary" },
  REVIEWED: { label: "Đã rà soát", variant: "warning" },
  APPROVED: { label: "Đã phê duyệt", variant: "outline", className: "border-emerald-500 text-emerald-600 font-medium" },
  PAID: { label: "Đã thanh toán", variant: "outline", className: "border-blue-500 text-blue-600 font-semibold" },
  LOCKED: { label: "Đã khóa sổ", variant: "default", className: "bg-gray-800 text-white" },
};

export function PayrollDetailClient({
  initialPeriod,
  canApprove,
}: {
  initialPeriod: PayrollPeriodDetailDto;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState<PayrollItemDto | null>(null);
  const [editAllowances, setEditAllowances] = useState(0);
  const [editBonuses, setEditBonuses] = useState(0);
  const [editDeductions, setEditDeductions] = useState(0);
  const [editAdjustments, setEditAdjustments] = useState(0);
  const [editReason, setEditReason] = useState("");

  const isLocked = period.status === "LOCKED";
  const isPaid = period.status === "PAID";
  const canEditItems = !isLocked && !isPaid;

  // 1. Calculate / Recalculate from actual attendances
  async function handleCalculate() {
    if (!confirm("Hệ thống sẽ tổng hợp giờ công thực tế và snapshot đơn giá lương mới nhất cho toàn bộ nhân sự. Tiếp tục?")) {
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/payroll/periods/${period.id}/calculate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(
          json.error?.message || json.message || "Lỗi khi tính toán bảng lương",
        );
      } else {
        setPeriod(json.data);
        router.refresh();
      }
    } catch {
      setActionError("Lỗi kết nối máy chủ");
    } finally {
      setActionLoading(false);
    }
  }

  // 2. Transition lifecycle status
  async function handleTransition(targetStatus: string, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;

    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/payroll/periods/${period.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(
          json.error?.message || json.message || "Lỗi khi cập nhật trạng thái",
        );
      } else {
        setPeriod(json.data);
        router.refresh();
      }
    } catch {
      setActionError("Lỗi kết nối máy chủ");
    } finally {
      setActionLoading(false);
    }
  }

  // 3. Open edit item modal
  function handleOpenEditItem(item: PayrollItemDto) {
    setEditingItem(item);
    setEditAllowances(Number(item.allowancesVND));
    setEditBonuses(Number(item.bonusesVND));
    setEditDeductions(Number(item.deductionsVND));
    setEditAdjustments(Number(item.adjustmentsVND));
    setEditReason(item.adjustmentReason ?? "");
    setActionError(null);
  }

  // 4. Save item edit
  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;

    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/payroll/items/${editingItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowances: Number(editAllowances),
          bonuses: Number(editBonuses),
          deductions: Number(editDeductions),
          adjustments: Number(editAdjustments),
          adjustmentReason: editReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setActionError(
          json.error?.message || json.message || "Lỗi khi lưu mục lương",
        );
      } else {
        // Update item in local list and recalculate period total
        setPeriod((prev) => {
          const updatedItems = prev.items.map((i) =>
            i.id === editingItem.id ? json.data : i,
          );
          const totalPayrollVND = updatedItems.reduce(
            (acc, cur) => acc + cur.totalPayVND,
            0n,
          );
          return {
            ...prev,
            items: updatedItems,
            totalPayrollVND,
          };
        });
        setEditingItem(null);
        router.refresh();
      }
    } catch {
      setActionError("Lỗi kết nối máy chủ");
    } finally {
      setActionLoading(false);
    }
  }

  const st = STATUS_LABELS[period.status] || {
    label: period.status,
    variant: "outline",
  };

  return (
    <div className="space-y-6">
      {/* Top Bar Navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/payroll">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Kỳ lương</span>
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{period.name}</h1>
          <Badge variant={st.variant} className={st.className}>
            {isLocked && <Lock className="mr-1 h-3 w-3 inline" />}
            {st.label}
          </Badge>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Export CSV button */}
          <a
            href={`/api/reports/export/payroll?periodId=${period.id}`}
            download={`bang-luong-${period.name}.csv`}
          >
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              <span>Xuất CSV (Excel)</span>
            </Button>
          </a>

          {/* Calculate button */}
          {!isLocked && !isPaid && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCalculate}
              disabled={actionLoading}
              className="gap-2 border-emerald-600/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
            >
              <Calculator className="h-4 w-4" />
              <span>Tính toán từ chấm công</span>
            </Button>
          )}

          {/* Lifecycle actions */}
          {period.status === "CALCULATED" && (
            <Button
              size="sm"
              onClick={() =>
                handleTransition("REVIEWED", "Xác nhận đã rà soát giờ công và các khoản phụ cấp?")
              }
              disabled={actionLoading}
              className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Xác nhận Rà soát</span>
            </Button>
          )}

          {period.status === "REVIEWED" && canApprove && (
            <Button
              size="sm"
              onClick={() =>
                handleTransition("APPROVED", "Phê duyệt bảng lương chính thức cho toàn bộ nhân sự?")
              }
              disabled={actionLoading}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Phê duyệt Bảng lương</span>
            </Button>
          )}

          {period.status === "APPROVED" && canApprove && (
            <Button
              size="sm"
              onClick={() =>
                handleTransition("PAID", "Xác nhận đã hoàn thành chi trả lương cho nhân viên?")
              }
              disabled={actionLoading}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Đã chi trả lương</span>
            </Button>
          )}

          {period.status === "PAID" && canApprove && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                handleTransition(
                  "LOCKED",
                  "LƯU Ý: Khóa sổ kế toán vĩnh viễn kỳ lương này? Sau khi khóa, không ai (kể cả Chủ quán) có thể sửa đổi.",
                )
              }
              disabled={actionLoading}
              className="gap-2"
            >
              <Lock className="h-4 w-4" />
              <span>Khóa sổ Vĩnh viễn</span>
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Period Details Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="pb-1">
            <span className="text-xs text-muted-foreground uppercase">Khoảng ngày tính lương</span>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-sm">
              {formatDateVN(period.periodStart)} – {formatDateVN(period.periodEnd)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-1">
            <span className="text-xs text-muted-foreground uppercase">Tổng số nhân sự</span>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{period.totalEmployees} nhân viên</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-1">
            <span className="text-xs text-muted-foreground uppercase">Tổng giờ tính lương</span>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{period.totalHours.toFixed(2)} giờ</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-1">
            <span className="text-xs text-muted-foreground uppercase">Tổng quỹ lương (VND)</span>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-emerald-600">
              {formatVnd(period.totalPayrollVND)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table of Payroll Items */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Bảng chi tiết Lương từng Nhân viên ({period.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {period.items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Kỳ lương này chưa có dữ liệu tính toán. Nhấn &quot;Tính toán từ chấm công&quot; ở góc phải để tạo bảng lương.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="py-3 px-3">Nhân viên</th>
                    <th className="py-3 px-3">Vị trí</th>
                    <th className="py-3 px-3 text-right">Giờ tính lương</th>
                    <th className="py-3 px-3 text-right">Giờ tăng ca</th>
                    <th className="py-3 px-3 text-right">Đơn giá/giờ</th>
                    <th className="py-3 px-3 text-right">Lương cơ bản</th>
                    <th className="py-3 px-3 text-right">Lương tăng ca</th>
                    <th className="py-3 px-3 text-right">Phụ cấp/Thưởng</th>
                    <th className="py-3 px-3 text-right">Khấu trừ</th>
                    <th className="py-3 px-3 text-right">Thực lĩnh</th>
                    {canEditItems && <th className="py-3 px-3 text-right">Sửa</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {period.items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="py-3 px-3">
                        <div className="font-medium text-foreground">
                          {item.employeeName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.employeeCode}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs">{item.primaryPositionName}</td>
                      <td className="py-3 px-3 text-right font-medium">
                        {item.paidHours.toFixed(2)}h
                      </td>
                      <td className="py-3 px-3 text-right">
                        {item.overtimeHours > 0 ? (
                          <span className="font-semibold text-amber-600">
                            +{item.overtimeHours.toFixed(2)}h
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0h</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground text-xs">
                        {formatVnd(item.hourlyRateSnapshotVND)}
                      </td>
                      <td className="py-3 px-3 text-right text-xs">
                        {formatVnd(item.basePayVND)}
                      </td>
                      <td className="py-3 px-3 text-right text-xs">
                        {item.overtimePayVND > 0n ? (
                          <span className="text-amber-600 font-medium">
                            +{formatVnd(item.overtimePayVND)}
                          </span>
                        ) : (
                          "0 ₫"
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-xs">
                        {item.allowancesVND + item.bonusesVND > 0n ? (
                          <span className="text-emerald-600 font-medium">
                            +{formatVnd(item.allowancesVND + item.bonusesVND)}
                          </span>
                        ) : (
                          "0 ₫"
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-xs">
                        {item.deductionsVND > 0n ? (
                          <span className="text-rose-600 font-medium">
                            -{formatVnd(item.deductionsVND)}
                          </span>
                        ) : (
                          "0 ₫"
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-600">
                        {formatVnd(item.totalPayVND)}
                      </td>
                      {canEditItems && (
                        <td className="py-3 px-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => handleOpenEditItem(item)}
                            title="Chỉnh sửa phụ cấp, thưởng, khấu trừ"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Payroll Item Modal */}
      {editingItem && (
        <Dialog open onOpenChange={() => setEditingItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Hiệu chỉnh Phụ cấp, Thưởng & Khấu trừ</DialogTitle>
              <DialogDescription>
                Nhân viên: {editingItem.employeeName} ({editingItem.employeeCode}) — Kỳ: {period.name}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveItem} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="item-allowances" className="text-xs">
                    Phụ cấp (VND):
                  </Label>
                  <Input
                    id="item-allowances"
                    type="number"
                    min={0}
                    value={editAllowances}
                    onChange={(e) => setEditAllowances(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="item-bonuses" className="text-xs text-emerald-600">
                    Thưởng (VND):
                  </Label>
                  <Input
                    id="item-bonuses"
                    type="number"
                    min={0}
                    value={editBonuses}
                    onChange={(e) => setEditBonuses(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="item-deductions" className="text-xs text-rose-600">
                    Khấu trừ (VND):
                  </Label>
                  <Input
                    id="item-deductions"
                    type="number"
                    min={0}
                    value={editDeductions}
                    onChange={(e) => setEditDeductions(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="item-adjustments" className="text-xs">
                    Điều chỉnh khác (±VND):
                  </Label>
                  <Input
                    id="item-adjustments"
                    type="number"
                    value={editAdjustments}
                    onChange={(e) => setEditAdjustments(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="item-reason" className="text-xs font-semibold">
                  Lý do điều chỉnh (Bắt buộc, tối thiểu 5 ký tự):
                </Label>
                <Input
                  id="item-reason"
                  required
                  placeholder="Ví dụ: Thưởng hoàn thành xuất sắc tháng 11, phụ cấp ăn trưa..."
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingItem(null)}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading || editReason.trim().length < 5}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {actionLoading ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
