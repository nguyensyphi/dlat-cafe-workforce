"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Eye,
  RefreshCw,
  Search,
} from "lucide-react";
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
import { formatVnd } from "@/lib/currency";

export interface HandoverRecord {
  id: string;
  shiftId: string;
  shiftName: string;
  workDate: string;
  status: "PENDING" | "SUBMITTED" | "CONFIRMED" | "DISCREPANCY";
  handoverEmployeeName: string;
  receivingEmployeeName: string | null;
  openingCashVnd: number;
  cashSalesVnd: number;
  cashExpensesVnd: number;
  expectedClosingCashVnd: number;
  actualClosingCashVnd: number;
  cashDifferenceVnd: number;
  cashDiscrepancyReason: string | null;
  stockReport: unknown;
  equipmentReport: unknown;
  cleanlinessReport: Array<{
    area?: string;
    isDone?: boolean;
    note?: string;
    isDueToday?: boolean;
  }> | unknown;
  customerNotes: string | null;
  pendingTasks: string[];
  handoverNotes: string | null;
  reviewNotes: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
}

interface HandoverManagementClientProps {
  initialHandovers: HandoverRecord[];
  initialDate: string;
}

export function HandoverManagementClient({
  initialHandovers,
}: HandoverManagementClientProps) {
  const router = useRouter();
  const [handovers, setHandovers] = useState<HandoverRecord[]>(initialHandovers);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedHandover, setSelectedHandover] = useState<HandoverRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewNoteInput, setReviewNoteInput] = useState("");

  useEffect(() => {
    setHandovers(initialHandovers);
  }, [initialHandovers]);

  useEffect(() => {
    router.refresh();
  }, [router]);

  const filtered = handovers.filter((h) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        h.handoverEmployeeName.toLowerCase().includes(q) ||
        h.shiftName.toLowerCase().includes(q) ||
        (h.receivingEmployeeName && h.receivingEmployeeName.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (statusFilter !== "ALL" && h.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const totalCount = handovers.length;
  const discrepancyCount = handovers.filter((h) => h.status === "DISCREPANCY" || h.cashDifferenceVnd !== 0).length;
  const confirmedCount = handovers.filter((h) => h.status === "CONFIRMED").length;
  const pendingCount = handovers.filter((h) => h.status === "SUBMITTED").length;

  async function handleConfirm(id: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/handovers/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNotes: reviewNoteInput.trim() || undefined }),
      });
      if (res.ok) {
        setHandovers((prev) =>
          prev.map((h) =>
            h.id === id ? { ...h, status: "CONFIRMED", reviewNotes: reviewNoteInput.trim() } : h,
          ),
        );
        setSelectedHandover(null);
        setReviewNoteInput("");
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "Xác nhận thất bại");
      }
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDispute(id: string) {
    if (!reviewNoteInput.trim()) {
      alert("Vui lòng nhập lý do phát hiện sai lệch");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/handovers/${id}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeReason: reviewNoteInput.trim() }),
      });
      if (res.ok) {
        setHandovers((prev) =>
          prev.map((h) =>
            h.id === id ? { ...h, status: "DISCREPANCY" } : h,
          ),
        );
        setSelectedHandover(null);
        setReviewNoteInput("");
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "Ghi nhận sai lệch thất bại");
      }
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReopen(id: string) {
    if (!reviewNoteInput.trim()) {
      alert("Vui lòng nhập lý do mở lại");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/handovers/${id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reopenReason: reviewNoteInput.trim() }),
      });
      if (res.ok) {
        setHandovers((prev) =>
          prev.map((h) =>
            h.id === id ? { ...h, status: "SUBMITTED" } : h,
          ),
        );
        setSelectedHandover(null);
        setReviewNoteInput("");
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "Mở lại thất bại");
      }
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý Bàn giao ca (Shift Handover)</h1>
          <p className="text-sm text-muted-foreground">
            Đối soát tiền quỹ két, kho nguyên liệu, thiết bị và công việc giữa các ca làm việc
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Tổng số biên bản</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Biên bản bàn giao</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-emerald-700">Đã xác nhận</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{confirmedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Quản lý đã thẩm duyệt</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-amber-700">Chờ duyệt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Đã nộp từ nhân viên</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-red-700">Lệch két / Khiếu nại</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{discrepancyCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Cần đối soát đặc biệt</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên nhân viên, tên ca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Trạng thái:</Label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="SUBMITTED">Chờ duyệt (SUBMITTED)</option>
            <option value="CONFIRMED">Đã xác nhận (CONFIRMED)</option>
            <option value="DISCREPANCY">Lệch két / Khiếu nại (DISCREPANCY)</option>
          </select>
        </div>
      </div>

      {/* Handover List Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-3 px-4 text-left">Ca & Ngày</th>
                  <th className="py-3 px-4 text-left">Người giao ca</th>
                  <th className="py-3 px-4 text-left">Người nhận ca</th>
                  <th className="py-3 px-4 text-right">Tiền két kỳ vọng</th>
                  <th className="py-3 px-4 text-right">Tiền két thực tế</th>
                  <th className="py-3 px-4 text-right">Chênh lệch</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">
                      Không tìm thấy biên bản bàn giao nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">{item.shiftName}</div>
                        <div className="text-xs text-muted-foreground">{item.workDate}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{item.handoverEmployeeName}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-muted-foreground">
                          {item.receivingEmployeeName || "— (Chưa tiếp quản)"}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium">
                        {formatVnd(item.expectedClosingCashVnd)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                        {formatVnd(item.actualClosingCashVnd)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`font-bold ${
                            item.cashDifferenceVnd === 0
                              ? "text-emerald-600"
                              : item.cashDifferenceVnd > 0
                              ? "text-blue-600"
                              : "text-red-600"
                          }`}
                        >
                          {item.cashDifferenceVnd > 0 ? "+" : ""}
                          {formatVnd(item.cashDifferenceVnd)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.status === "CONFIRMED" && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                            ✓ Đã xác nhận
                          </Badge>
                        )}
                        {item.status === "SUBMITTED" && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                            ⏳ Chờ duyệt
                          </Badge>
                        )}
                        {item.status === "DISCREPANCY" && (
                          <Badge className="bg-red-100 text-red-800 border-red-200">
                            ⚠️ Có sai lệch
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedHandover(item);
                            setReviewNoteInput(item.reviewNotes || "");
                          }}
                          className="gap-1.5 h-8 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Chi tiết</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail & Action Modal */}
      {selectedHandover && (
        <Dialog open={true} onOpenChange={() => setSelectedHandover(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center justify-between">
                <span>Chi tiết Biên bản Bàn giao: {selectedHandover.shiftName}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {selectedHandover.workDate}
                </span>
              </DialogTitle>
              <DialogDescription>
                Bàn giao bởi <strong>{selectedHandover.handoverEmployeeName}</strong>
                {selectedHandover.receivingEmployeeName && (
                  <> → Tiếp nhận bởi <strong>{selectedHandover.receivingEmployeeName}</strong></>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm mt-2">
              {/* Cash Reconciliation Details */}
              <div className="p-3.5 rounded-lg bg-slate-50 border space-y-2">
                <div className="font-semibold text-xs text-amber-800 uppercase flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4" /> Đối soát quỹ két tiền mặt
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Đầu ca:</div>
                    <div className="font-semibold">{formatVnd(selectedHandover.openingCashVnd)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Thu bán hàng:</div>
                    <div className="font-semibold">{formatVnd(selectedHandover.cashSalesVnd)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Chi tiền mặt:</div>
                    <div className="font-semibold">{formatVnd(selectedHandover.cashExpensesVnd)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Thực tế trong két:</div>
                    <div className="font-bold text-emerald-700">
                      {formatVnd(selectedHandover.actualClosingCashVnd)}
                    </div>
                  </div>
                </div>
                <div className="border-t pt-2 flex items-center justify-between text-xs font-bold">
                  <span>Chênh lệch két (Variance):</span>
                  <span
                    className={
                      selectedHandover.cashDifferenceVnd === 0
                        ? "text-emerald-700"
                        : "text-red-700"
                    }
                  >
                    {selectedHandover.cashDifferenceVnd > 0 ? "+" : ""}
                    {formatVnd(selectedHandover.cashDifferenceVnd)}
                  </span>
                </div>
                {selectedHandover.cashDiscrepancyReason && (
                  <div className="text-xs text-red-800 bg-red-50 p-2 rounded border border-red-200">
                    <strong>Giải trình nhân viên:</strong> {selectedHandover.cashDiscrepancyReason}
                  </div>
                )}
              </div>

              {/* D'Lat Daily Checklist Summary */}
              {Array.isArray(selectedHandover.cleanlinessReport) &&
                selectedHandover.cleanlinessReport.length > 0 && (
                  <div className="p-3 rounded-lg border bg-slate-50/70 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">
                        Checklist công việc ca (
                        {
                          selectedHandover.cleanlinessReport.filter(
                            (c: { isDone?: boolean }) => c.isDone,
                          ).length
                        }
                        /{selectedHandover.cleanlinessReport.length} mục đã tick)
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {selectedHandover.cleanlinessReport.map(
                        (
                          c: {
                            area?: string;
                            isDone?: boolean;
                            note?: string;
                            isDueToday?: boolean;
                          },
                          idx: number,
                        ) => (
                          <div
                            key={idx}
                            className={`flex items-start justify-between gap-2 rounded px-2 py-1 ${
                              c.isDone
                                ? "bg-emerald-50/70 text-emerald-900"
                                : c.isDueToday === false
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-rose-50 text-rose-900 border border-rose-200"
                            }`}
                          >
                            <span>
                              {c.isDone ? "☑" : "☐"} {c.area}
                            </span>
                            {c.note && (
                              <span className="italic text-[11px] shrink-0 max-w-[220px] truncate">
                                {c.note}
                              </span>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {/* Tasks & Customer Notes */}
              {(selectedHandover.pendingTasks?.length > 0 || selectedHandover.customerNotes) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {selectedHandover.pendingTasks?.length > 0 && (
                    <div className="p-3 rounded-lg border bg-amber-50/50">
                      <div className="font-semibold text-amber-900 mb-1">Công việc tồn đọng:</div>
                      <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                        {selectedHandover.pendingTasks.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedHandover.customerNotes && (
                    <div className="p-3 rounded-lg border bg-blue-50/50">
                      <div className="font-semibold text-blue-900 mb-1">Ghi chú khách & đơn:</div>
                      <p className="text-slate-700">{selectedHandover.customerNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Manager Review Input */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold">Ý kiến thẩm duyệt của Quản lý / Chủ quán:</Label>
                <Input
                  placeholder="Ghi chú thẩm duyệt hoặc nguyên nhân sai lệch..."
                  value={reviewNoteInput}
                  onChange={(e) => setReviewNoteInput(e.target.value)}
                  className="text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedHandover(null)}
                >
                  Đóng
                </Button>

                {selectedHandover.status !== "CONFIRMED" && (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionLoading}
                      onClick={() => handleDispute(selectedHandover.id)}
                      className="gap-1 text-xs"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Ghi nhận sai lệch
                    </Button>
                    <Button
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleConfirm(selectedHandover.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Xác nhận biên bản
                    </Button>
                  </>
                )}

                {selectedHandover.status === "CONFIRMED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => handleReopen(selectedHandover.id)}
                    className="text-amber-700 border-amber-300 text-xs gap-1"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Mở lại biên bản
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
