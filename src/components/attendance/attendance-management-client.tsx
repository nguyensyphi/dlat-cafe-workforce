"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  QrCode,
  Search,
  UserCheck,
  XCircle,
} from "lucide-react";
import { formatDateVN, formatDateTimeVN, formatTimeVN, todayDateStringVN } from "@/lib/date";
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
import type { AttendanceDto } from "@/modules/attendance/attendance.types";

export function AttendanceManagementClient({
  initialAttendances,
  initialDate,
}: {
  initialAttendances: AttendanceDto[];
  initialDate: string;
}) {
  const router = useRouter();
  const [attendances, setAttendances] = useState(initialAttendances);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  useEffect(() => {
    setAttendances(initialAttendances);
  }, [initialAttendances]);

  useEffect(() => {
    setSelectedDate(initialDate);
  }, [initialDate]);

  // Adjustment Modal State
  const [editingAttendance, setEditingAttendance] = useState<AttendanceDto | null>(null);
  const [editApprovedMinutes, setEditApprovedMinutes] = useState(0);
  const [editPaidMinutes, setEditPaidMinutes] = useState(0);
  const [editStatus, setEditStatus] = useState<"APPROVED" | "REJECTED" | "PENDING">("APPROVED");
  const [editReason, setEditReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filter attendances
  const filtered = attendances.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        a.employeeName.toLowerCase().includes(q) ||
        a.employeeCode.toLowerCase().includes(q) ||
        (a.shiftName && a.shiftName.toLowerCase().includes(q));
      if (!match) return false;
    }

    if (statusFilter === "PENDING" && a.status !== "PENDING") return false;
    if (statusFilter === "APPROVED" && a.status !== "APPROVED") return false;
    if (statusFilter === "REJECTED" && a.status !== "REJECTED") return false;
    if (statusFilter === "ANOMALY" && !a.isMissingClockOut && a.lateMinutes === 0) return false;

    return true;
  });

  // Calculate KPIs
  const totalRecords = attendances.length;
  const onTimeCount = attendances.filter(
    (a) => a.clockIn && a.lateMinutes === 0 && !a.isMissingClockOut,
  ).length;
  const lateCount = attendances.filter((a) => a.lateMinutes > 0).length;
  const anomalyCount = attendances.filter((a) => a.isMissingClockOut).length;

  // Open edit modal
  function handleOpenEdit(a: AttendanceDto) {
    setEditingAttendance(a);
    setEditApprovedMinutes(a.approvedMinutes ?? a.workedMinutes);
    setEditPaidMinutes(a.paidMinutes ?? a.workedMinutes);
    setEditStatus(a.status === "REJECTED" ? "REJECTED" : "APPROVED");
    setEditReason(a.adjustmentReason ?? "");
    setActionError(null);
  }

  // Quick Approve
  async function handleQuickApprove(a: AttendanceDto) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/attendance/${a.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedMinutes: a.workedMinutes,
          paidMinutes: a.workedMinutes,
          status: "APPROVED",
          adjustmentReason: "Quản lý duyệt nhanh theo giờ thực tế",
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setAttendances((prev) =>
          prev.map((item) => (item.id === a.id ? json.data : item)),
        );
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "Không thể duyệt bản ghi");
      }
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setActionLoading(false);
    }
  }

  // Submit manual adjustment
  async function handleSaveAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAttendance) return;

    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/attendance/${editingAttendance.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedMinutes: Number(editApprovedMinutes),
          paidMinutes: Number(editPaidMinutes),
          status: editStatus,
          adjustmentReason: editReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setActionError(
          json.error?.message || json.message || "Không thể cập nhật bản ghi",
        );
      } else {
        setAttendances((prev) =>
          prev.map((item) =>
            item.id === editingAttendance.id ? json.data : item,
          ),
        );
        setEditingAttendance(null);
        router.refresh();
      }
    } catch {
      setActionError("Lỗi kết nối máy chủ");
    } finally {
      setActionLoading(false);
    }
  }

  // Change date filter
  async function handleDateChange(newDate: string) {
    setSelectedDate(newDate);
    try {
      const res = await fetch(`/api/attendance?workDate=${newDate}`);
      if (res.ok) {
        const json = await res.json();
        setAttendances(json.data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Duyệt Chấm công & Giờ làm</h1>
          <p className="text-sm text-muted-foreground">
            Theo dõi dữ liệu chấm công QR, phát hiện dị thường và phê duyệt giờ công 4 tầng
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/attendance/kiosk" target="_blank">
            <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
              <QrCode className="h-4 w-4" />
              <span>Mở Kiosk Chấm công</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tổng lượt đi làm
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRecords}</div>
            <p className="text-xs text-muted-foreground">
              Ngày {formatDateVN(selectedDate)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Đúng giờ
            </CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{onTimeCount}</div>
            <p className="text-xs text-muted-foreground">Không trễ giờ, đủ giờ</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Đi trễ / Về sớm
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{lateCount}</div>
            <p className="text-xs text-muted-foreground">Cần kiểm tra thời gian</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dị thường / Quên chấm
            </CardTitle>
            <XCircle className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">{anomalyCount}</div>
            <p className="text-xs text-muted-foreground">Cần quản lý hiệu chỉnh</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              {/* Date Input */}
              <div className="flex items-center gap-2">
                <Label htmlFor="date-filter" className="text-xs text-muted-foreground">
                  Ngày:
                </Label>
                <Input
                  id="date-filter"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="h-9 w-40 text-sm"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Label htmlFor="status-filter" className="text-xs text-muted-foreground">
                  Trạng thái:
                </Label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="PENDING">Chờ duyệt</option>
                  <option value="APPROVED">Đã duyệt</option>
                  <option value="REJECTED">Từ chối</option>
                  <option value="ANOMALY">Có dị thường / Trễ</option>
                </select>
              </div>

              {/* Search */}
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm nhân viên, mã NV..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-sm"
                />
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDateChange(todayDateStringVN())}
              className="h-9 text-xs"
            >
              Hôm nay
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Bảng Chấm công 4 Tầng Giờ ({filtered.length} bản ghi)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Không có bản ghi chấm công nào phù hợp với bộ lọc.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="py-3 px-3">Nhân viên</th>
                    <th className="py-3 px-3">Ca làm</th>
                    <th className="py-3 px-3">Vào ca</th>
                    <th className="py-3 px-3">Tan ca</th>
                    <th className="py-3 px-3 text-right">Giờ theo ca (T1)</th>
                    <th className="py-3 px-3 text-right">Giờ thực tế (T2)</th>
                    <th className="py-3 px-3 text-right">Giờ duyệt (T3)</th>
                    <th className="py-3 px-3 text-right">Giờ tính lương (T4)</th>
                    <th className="py-3 px-3 text-center">Trạng thái</th>
                    <th className="py-3 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="py-3 px-3">
                        <div className="font-medium text-foreground">
                          {item.employeeName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.employeeCode}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-sm">{item.shiftName}</span>
                      </td>
                      <td className="py-3 px-3">
                        {item.clockIn ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{formatTimeVN(item.clockIn)}</span>
                            {item.lateMinutes > 0 && (
                              <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                                Trễ {item.lateMinutes}p
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {item.clockOut ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{formatTimeVN(item.clockOut)}</span>
                            {item.earlyLeaveMinutes > 0 && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                Sớm {item.earlyLeaveMinutes}p
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {/* 4-Tier Hours */}
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        {item.scheduledHours.toFixed(2)}h
                      </td>
                      <td className="py-3 px-3 text-right font-medium">
                        {item.workedHours.toFixed(2)}h
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-blue-600 dark:text-blue-400">
                        {item.approvedHours !== null
                          ? `${item.approvedHours.toFixed(2)}h`
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-600">
                        {item.paidHours !== null
                          ? `${item.paidHours.toFixed(2)}h`
                          : "Chờ duyệt"}
                      </td>
                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        {item.isMissingClockOut ? (
                          <Badge variant="destructive">Quên chấm về</Badge>
                        ) : item.status === "APPROVED" ? (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                            Đã duyệt
                          </Badge>
                        ) : item.status === "REJECTED" ? (
                          <Badge variant="destructive">Từ chối</Badge>
                        ) : (
                          <Badge variant="outline">Chờ duyệt</Badge>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.status === "PENDING" && !item.isMissingClockOut && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleQuickApprove(item)}
                              disabled={actionLoading}
                              className="h-8 gap-1 border-emerald-500/40 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Duyệt</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(item)}
                            className="h-8 w-8 p-0"
                            title="Hiệu chỉnh công"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Correction & Review Modal */}
      {editingAttendance && (
        <Dialog open onOpenChange={() => setEditingAttendance(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Hiệu chỉnh & Duyệt Giờ công</DialogTitle>
              <DialogDescription>
                Nhân viên: {editingAttendance.employeeName} ({editingAttendance.employeeCode}) —
                Ngày {formatDateVN(editingAttendance.workDate)}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveAdjustment} className="space-y-4 pt-2">
              {actionError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {actionError}
                </div>
              )}

              {/* Event Timeline Preview */}
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nhật ký sự kiện chấm công (Server Timestamps):
                </span>
                {editingAttendance.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Chưa có sự kiện nào.</p>
                ) : (
                  <div className="space-y-1 text-xs">
                    {editingAttendance.events.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between">
                        <span className="font-medium">
                          {ev.eventType === "CLOCK_IN"
                            ? "Vào ca"
                            : ev.eventType === "BREAK_START"
                              ? "Bắt đầu nghỉ"
                              : ev.eventType === "BREAK_END"
                                ? "Kết thúc nghỉ"
                                : "Tan ca"}
                          :
                        </span>
                        <span className="text-muted-foreground">
                          {formatDateTimeVN(ev.occurredAt)} ({ev.source})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Hours Adjustment Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="approved-minutes" className="text-xs">
                    Số phút duyệt (T3):
                  </Label>
                  <Input
                    id="approved-minutes"
                    type="number"
                    min={0}
                    value={editApprovedMinutes}
                    onChange={(e) => setEditApprovedMinutes(Number(e.target.value))}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    ~ {(editApprovedMinutes / 60).toFixed(2)} giờ
                  </span>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="paid-minutes" className="text-xs font-medium text-emerald-600">
                    Số phút tính lương (T4):
                  </Label>
                  <Input
                    id="paid-minutes"
                    type="number"
                    min={0}
                    value={editPaidMinutes}
                    onChange={(e) => setEditPaidMinutes(Number(e.target.value))}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    ~ {(editPaidMinutes / 60).toFixed(2)} giờ
                  </span>
                </div>
              </div>

              {/* Status Select */}
              <div className="space-y-1">
                <Label htmlFor="status-select" className="text-xs">
                  Quyết định phê duyệt:
                </Label>
                <select
                  id="status-select"
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as "APPROVED" | "REJECTED" | "PENDING")
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                >
                  <option value="APPROVED">Duyệt giờ công (APPROVED)</option>
                  <option value="REJECTED">Từ chối bản ghi (REJECTED)</option>
                  <option value="PENDING">Giữ chờ duyệt (PENDING)</option>
                </select>
              </div>

              {/* Mandatory Reason */}
              <div className="space-y-1">
                <Label htmlFor="adj-reason" className="text-xs font-semibold">
                  Lý do điều chỉnh (Bắt buộc, tối thiểu 5 ký tự):
                </Label>
                <Input
                  id="adj-reason"
                  required
                  placeholder="Ví dụ: Nhân viên quên chấm về lúc 23:00, đã xác nhận với trưởng ca..."
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingAttendance(null)}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading || editReason.trim().length < 5}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {actionLoading ? "Đang lưu..." : "Xác nhận & Ghi nhận"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
