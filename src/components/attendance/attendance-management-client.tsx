"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  QrCode,
  Search,
  UserCheck,
  X,
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
import type { ActiveAttendanceAlertsDto } from "@/modules/attendance/attendance-monitor.service";
import { AttendanceAlertsPanel } from "./attendance-alerts-panel";

interface EmployeeTimesheetSummary {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  shiftCount: number;
  totalScheduledHours: number;
  totalWorkedHours: number;
  totalPaidHours: number;
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
  pendingOvertimeHours: number;
  approvedOvertimeHours: number;
  anomalyCount: number;
  unscheduledCount: number;
  isAllApproved: boolean;
  records: AttendanceDto[];
}

export function AttendanceManagementClient({
  initialAttendances,
  initialDate,
  initialAlerts,
}: {
  initialAttendances: AttendanceDto[];
  initialDate: string;
  initialAlerts?: ActiveAttendanceAlertsDto;
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"DAILY" | "TIMESHEET">("DAILY");

  // Daily Mode States
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

  useEffect(() => {
    router.refresh();
  }, [router]);

  // Timesheet Period States
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const curMonthStr = curMonth < 10 ? `0${curMonth}` : `${curMonth}`;
  const [timesheetStart, setTimesheetStart] = useState(`${curYear}-${curMonthStr}-01`);
  const [timesheetEnd, setTimesheetEnd] = useState(
    now.getDate() <= 15
      ? `${curYear}-${curMonthStr}-15`
      : `${curYear}-${curMonthStr}-${new Date(curYear, curMonth, 0).getDate()}`,
  );
  const [timesheetAttendances, setTimesheetAttendances] = useState<AttendanceDto[]>([]);
  const [timesheetLoading, setTimesheetLoading] = useState(false);
  const [selectedEmpForDetail, setSelectedEmpForDetail] = useState<EmployeeTimesheetSummary | null>(null);

  // Adjustment Modal State
  const [editingAttendance, setEditingAttendance] = useState<AttendanceDto | null>(null);
  const [editApprovedMinutes, setEditApprovedMinutes] = useState(0);
  const [editPaidMinutes, setEditPaidMinutes] = useState(0);
  const [editStatus, setEditStatus] = useState<"APPROVED" | "REJECTED" | "PENDING">("APPROVED");
  const [editReason, setEditReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filter daily attendances
  const filteredDaily = attendances.filter((a) => {
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
    if (statusFilter === "ANOMALY" && !a.isMissingClockOut && a.lateMinutes === 0 && !a.isUnscheduled) return false;
    if (statusFilter === "OVERTIME" && (!a.overtimeMinutes || a.overtimeMinutes === 0)) return false;

    return true;
  });

  // Daily KPIs
  const totalRecords = attendances.length;
  const onTimeCount = attendances.filter(
    (a) => a.clockIn && a.lateMinutes === 0 && !a.isMissingClockOut,
  ).length;
  const lateCount = attendances.filter((a) => a.lateMinutes > 0).length;
  const anomalyCount = attendances.filter((a) => a.isMissingClockOut || a.isUnscheduled).length;
  const pendingOtCount = attendances.filter(
    (a) => a.overtimeStatus === "PENDING_REVIEW" || a.overtimeStatus === "DETECTED",
  ).length;

  // Open edit modal
  function handleOpenEdit(a: AttendanceDto) {
    setEditingAttendance(a);
    setEditApprovedMinutes(a.approvedMinutes ?? a.workedMinutes);
    setEditPaidMinutes(a.paidMinutes ?? a.workedMinutes);
    setEditStatus(a.status === "REJECTED" ? "REJECTED" : "APPROVED");
    setEditReason(a.adjustmentReason ?? "");
    setActionError(null);
  }

  // Quick Approve Shift
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
        if (viewMode === "TIMESHEET") {
          setTimesheetAttendances((prev) =>
            prev.map((item) => (item.id === a.id ? json.data : item)),
          );
        }
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

  // Quick Review Overtime
  async function handleReviewOvertime(attendanceId: string, approved: boolean) {
    const defaultNote = approved ? "Đã duyệt tăng ca hợp lệ" : "Không phát sinh tăng ca theo kế hoạch";
    const note = prompt(
      approved ? "Ghi chú duyệt tăng ca (tùy chọn):" : "Lý do từ chối tăng ca (tùy chọn):",
      defaultNote,
    );
    if (note === null) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/attendance/${attendanceId}/review-overtime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, note }),
      });
      const json = await res.json();
      if (res.ok) {
        setAttendances((prev) =>
          prev.map((item) => (item.id === attendanceId ? json.data : item)),
        );
        if (viewMode === "TIMESHEET") {
          setTimesheetAttendances((prev) =>
            prev.map((item) => (item.id === attendanceId ? json.data : item)),
          );
        }
        router.refresh();
      } else {
        alert(json.error?.message || json.message || "Lỗi khi xử lý duyệt OT");
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
        if (viewMode === "TIMESHEET") {
          setTimesheetAttendances((prev) =>
            prev.map((item) =>
              item.id === editingAttendance.id ? json.data : item,
            ),
          );
        }
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

  // Batch approve normal shifts (Daily)
  async function handleBatchApprove() {
    const normalPendingIds = attendances
      .filter((a) => a.status === "PENDING" && !a.isMissingClockOut && a.lateMinutes === 0 && a.workedMinutes > 0)
      .map((a) => a.id);

    if (normalPendingIds.length === 0) {
      alert("Không có ca bình thường nào đang chờ duyệt.");
      return;
    }

    if (!confirm(`Bạn có chắc muốn duyệt tự động ${normalPendingIds.length} ca bình thường?`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch("/api/attendance/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceIds: normalPendingIds }),
      });
      const json = await res.json();
      if (res.ok) {
        alert(`Đã duyệt thành công ${json.data.approvedCount} ca.`);
        router.refresh();
        await handleDateChange(selectedDate);
      } else {
        alert(json.message || "Lỗi khi duyệt hàng loạt");
      }
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setActionLoading(false);
    }
  }

  // Fetch timesheet attendances by date range
  async function loadTimesheetData(start: string, end: string) {
    setTimesheetLoading(true);
    try {
      const res = await fetch(`/api/attendance?startDate=${start}&endDate=${end}`);
      if (res.ok) {
        const json = await res.json();
        setTimesheetAttendances(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTimesheetLoading(false);
    }
  }

  // Load timesheet on mount or range change
  useEffect(() => {
    if (viewMode === "TIMESHEET") {
      loadTimesheetData(timesheetStart, timesheetEnd);
    }
  }, [viewMode, timesheetStart, timesheetEnd]);

  // Apply Timesheet Presets
  function applyTimesheetPreset(preset: "PERIOD_1" | "PERIOD_2" | "THIS_WEEK") {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStr = month < 10 ? `0${month}` : `${month}`;

    if (preset === "PERIOD_1") {
      setTimesheetStart(`${year}-${monthStr}-01`);
      setTimesheetEnd(`${year}-${monthStr}-15`);
    } else if (preset === "PERIOD_2") {
      const lastDay = new Date(year, month, 0).getDate();
      setTimesheetStart(`${year}-${monthStr}-16`);
      setTimesheetEnd(`${year}-${monthStr}-${lastDay}`);
    } else if (preset === "THIS_WEEK") {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const mMonth = monday.getMonth() + 1;
      const mMonthStr = mMonth < 10 ? `0${mMonth}` : `${mMonth}`;
      const mDateStr = monday.getDate() < 10 ? `0${monday.getDate()}` : `${monday.getDate()}`;
      const sMonth = sunday.getMonth() + 1;
      const sMonthStr = sMonth < 10 ? `0${sMonth}` : `${sMonth}`;
      const sDateStr = sunday.getDate() < 10 ? `0${sunday.getDate()}` : `${sunday.getDate()}`;

      setTimesheetStart(`${monday.getFullYear()}-${mMonthStr}-${mDateStr}`);
      setTimesheetEnd(`${sunday.getFullYear()}-${sMonthStr}-${sDateStr}`);
    }
  }

  // Aggregate timesheet attendances by employee
  const timesheetSummaries = useMemo<EmployeeTimesheetSummary[]>(() => {
    const map = new Map<string, EmployeeTimesheetSummary>();

    for (const a of timesheetAttendances) {
      let entry = map.get(a.employeeId);
      if (!entry) {
        entry = {
          employeeId: a.employeeId,
          employeeName: a.employeeName,
          employeeCode: a.employeeCode,
          shiftCount: 0,
          totalScheduledHours: 0,
          totalWorkedHours: 0,
          totalPaidHours: 0,
          totalLateMinutes: 0,
          totalEarlyLeaveMinutes: 0,
          pendingOvertimeHours: 0,
          approvedOvertimeHours: 0,
          anomalyCount: 0,
          unscheduledCount: 0,
          isAllApproved: true,
          records: [],
        };
        map.set(a.employeeId, entry);
      }

      entry.shiftCount += 1;
      entry.totalScheduledHours += a.scheduledHours;
      entry.totalWorkedHours += a.workedHours;
      entry.totalPaidHours += a.paidHours !== null ? a.paidHours : a.workedHours;
      entry.totalLateMinutes += a.lateMinutes;
      entry.totalEarlyLeaveMinutes += a.earlyLeaveMinutes;

      if (a.overtimeStatus === "PENDING_REVIEW" || a.overtimeStatus === "DETECTED") {
        entry.pendingOvertimeHours += Number((a.overtimeMinutes / 60).toFixed(2));
      } else if (a.overtimeStatus === "APPROVED") {
        entry.approvedOvertimeHours += Number((a.overtimeMinutes / 60).toFixed(2));
      }

      if (a.isMissingClockOut) entry.anomalyCount += 1;
      if (a.isUnscheduled) entry.unscheduledCount += 1;
      if (a.status !== "APPROVED") entry.isAllApproved = false;

      entry.records.push(a);
    }

    return Array.from(map.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [timesheetAttendances]);

  // Batch confirm entire period timesheet
  async function handleBatchConfirmPeriod() {
    const pendingEligible = timesheetAttendances
      .filter((a) => a.status === "PENDING" && !a.isMissingClockOut)
      .map((a) => a.id);

    if (pendingEligible.length === 0) {
      alert("Không có ca hợp lệ nào đang chờ xác nhận trong khoảng ngày này.");
      return;
    }

    if (
      !confirm(
        `Xác nhận Bảng công: Hệ thống sẽ tự động duyệt ${pendingEligible.length} ca làm việc hợp lệ trong kỳ (${formatDateVN(timesheetStart)} – ${formatDateVN(timesheetEnd)}). Tiếp tục?`,
      )
    ) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch("/api/attendance/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceIds: pendingEligible }),
      });
      const json = await res.json();
      if (res.ok) {
        alert(`Đã xác nhận thành công ${json.data.approvedCount} ca làm việc.`);
        await loadTimesheetData(timesheetStart, timesheetEnd);
        router.refresh();
      } else {
        alert(json.message || "Lỗi khi xác nhận bảng công");
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Duyệt Chấm công & Bảng công Kỳ</h1>
          <p className="text-sm text-muted-foreground">
            Đối chiếu lịch được duyệt với chấm công QR, phát hiện OT, làm tròn 5 phút và xác nhận bảng công (PRD v1.0)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "DAILY" ? (
            <Button
              variant="outline"
              onClick={handleBatchApprove}
              disabled={actionLoading}
              className="min-h-[44px] flex-1 sm:flex-none gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Duyệt hàng loạt ca chuẩn</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleBatchConfirmPeriod}
              disabled={actionLoading}
              className="min-h-[44px] flex-1 sm:flex-none gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 font-semibold"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Xác nhận Toàn bộ Bảng công kỳ</span>
            </Button>
          )}

          <Link href="/attendance/kiosk" target="_blank" className="flex-1 sm:flex-none">
            <Button className="min-h-[44px] w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
              <QrCode className="h-4 w-4 shrink-0" />
              <span>Mở Kiosk Chấm công</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-70 shrink-0" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Button
          variant={viewMode === "DAILY" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("DAILY")}
          className={`min-h-[44px] sm:min-h-0 flex-1 sm:flex-none ${viewMode === "DAILY" ? "bg-emerald-600 text-white" : ""}`}
        >
          <Clock className="mr-1.5 h-4 w-4 shrink-0" />
          Nhật ký chấm công ngày
        </Button>
        <Button
          variant={viewMode === "TIMESHEET" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("TIMESHEET")}
          className={`min-h-[44px] sm:min-h-0 flex-1 sm:flex-none ${viewMode === "TIMESHEET" ? "bg-emerald-600 text-white" : ""}`}
        >
          <FileSpreadsheet className="mr-1.5 h-4 w-4 shrink-0" />
          Bảng tổng hợp công kỳ (Module E)
        </Button>
      </div>

      {/* ========================================================================= */}
      {/* VIEW MODE 1: DAILY ATTENDANCE                                            */}
      {/* ========================================================================= */}
      {viewMode === "DAILY" && (
        <div className="space-y-6">
          {initialAlerts && (
            <AttendanceAlertsPanel
              initialAlerts={initialAlerts}
              showEmptyState={true}
            />
          )}

          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
                  Tăng ca (OT) chờ duyệt
                </CardTitle>
                <Clock className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{pendingOtCount}</div>
                <p className="text-xs text-muted-foreground">Yêu cầu quản lý phê duyệt</p>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Dị thường / Ngoài lịch
                </CardTitle>
                <XCircle className="h-4 w-4 text-rose-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-600">{anomalyCount}</div>
                <p className="text-xs text-muted-foreground">Quên chấm về / ngoài lịch</p>
              </CardContent>
            </Card>
          </div>

          {/* Filter Bar */}
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-3">
                  {/* Date Input */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Label htmlFor="date-filter" className="text-xs text-muted-foreground shrink-0">
                      Ngày:
                    </Label>
                    <Input
                      id="date-filter"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="min-h-[44px] sm:h-9 flex-1 sm:w-40 text-sm"
                    />
                  </div>

                  {/* Status Filter */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Label htmlFor="status-filter" className="text-xs text-muted-foreground shrink-0">
                      Trạng thái:
                    </Label>
                    <select
                      id="status-filter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="min-h-[44px] sm:h-9 flex-1 sm:flex-none rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="ALL">Tất cả trạng thái</option>
                      <option value="PENDING">Chờ duyệt</option>
                      <option value="APPROVED">Đã duyệt</option>
                      <option value="REJECTED">Từ chối</option>
                      <option value="OVERTIME">Có tăng ca (OT)</option>
                      <option value="ANOMALY">Có dị thường / Ngoài lịch / Trễ</option>
                    </select>
                  </div>

                  {/* Search */}
                  <div className="relative w-full sm:min-w-[200px] sm:flex-1">
                    <Search className="absolute left-2.5 top-3.5 sm:top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Tìm nhân viên, mã NV..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="min-h-[44px] sm:h-9 pl-8 text-sm"
                    />
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDateChange(todayDateStringVN())}
                  className="min-h-[44px] sm:h-9 w-full sm:w-auto text-xs"
                >
                  Hôm nay
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Daily Data Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Bảng Chấm công 4 Tầng Giờ ({filteredDaily.length} bản ghi)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredDaily.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Không có bản ghi chấm công nào phù hợp với bộ lọc.
                </div>
              ) : (
                <>
                {/* Mobile Card View (< md) */}
                <div className="space-y-3 md:hidden">
                  {filteredDaily.map((item) => (
                    <div
                      key={`mob-${item.id}`}
                      className="rounded-xl border border-border bg-white p-3.5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 truncate">
                            {item.employeeName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.employeeCode} • {item.shiftName}
                          </p>
                        </div>
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
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-lg p-2.5">
                        <div>
                          <span className="text-muted-foreground">Vào ca: </span>
                          <span className="font-medium">
                            {item.clockIn ? formatTimeVN(item.clockIn) : "—"}
                          </span>
                          {item.lateMinutes > 0 && (
                            <span className="ml-1 text-amber-700 font-semibold">
                              (Trễ {item.lateMinutes}p)
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tan ca: </span>
                          <span className="font-medium">
                            {item.clockOut ? formatTimeVN(item.clockOut) : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Thực tế: </span>
                          <span className="font-medium">{item.workedHours.toFixed(2)}h</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tính lương: </span>
                          <span className="font-bold text-emerald-700">
                            {item.paidHours !== null ? `${item.paidHours.toFixed(2)}h` : "Chờ duyệt"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {item.status === "PENDING" && !item.isMissingClockOut && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQuickApprove(item)}
                            disabled={actionLoading}
                            className="min-h-[44px] flex-1 gap-1.5 border-emerald-500/40 text-xs text-emerald-700 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Duyệt ca</span>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEdit(item)}
                          className="min-h-[44px] flex-1 gap-1.5 text-xs"
                        >
                          <Edit3 className="h-4 w-4" />
                          <span>Sửa công</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View (>= md) */}
                <div className="hidden md:block overflow-x-auto">
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
                        <th className="py-3 px-3 text-right font-semibold text-emerald-600">Giờ tính lương (T4)</th>
                        <th className="py-3 px-3 text-center">Trạng thái ca</th>
                        <th className="py-3 px-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredDaily.map((item) => (
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
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium">{item.shiftName}</span>
                              <div className="flex flex-wrap gap-1">
                                {item.isUnscheduled && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/30">
                                    Ngoài lịch
                                  </Badge>
                                )}
                                {item.overtimeMinutes > 0 && (
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 ${
                                      item.overtimeStatus === "APPROVED"
                                        ? "border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                                        : item.overtimeStatus === "REJECTED"
                                          ? "border-rose-400 text-rose-700 bg-rose-50 dark:bg-rose-950/30"
                                          : "border-purple-400 text-purple-800 bg-purple-50 dark:bg-purple-950/30 animate-pulse"
                                    }`}
                                  >
                                    OT: +{item.overtimeMinutes}p ({
                                      item.overtimeStatus === "APPROVED"
                                        ? "Đã duyệt"
                                        : item.overtimeStatus === "REJECTED"
                                          ? "Từ chối"
                                          : "Chờ duyệt"
                                    })
                                  </Badge>
                                )}
                              </div>
                            </div>
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
                          <td className="py-3 px-3 text-right text-muted-foreground text-xs">
                            {item.scheduledHours.toFixed(2)}h
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-xs">
                            {item.workedHours.toFixed(2)}h
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-blue-600 dark:text-blue-400 text-xs">
                            {item.approvedHours !== null
                              ? `${item.approvedHours.toFixed(2)}h`
                              : "—"}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-600 text-sm">
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
                              {/* Overtime Review Quick Buttons */}
                              {(item.overtimeStatus === "PENDING_REVIEW" || item.overtimeStatus === "DETECTED") && (
                                <div className="flex items-center gap-1 mr-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReviewOvertime(item.id, true)}
                                    disabled={actionLoading}
                                    className="h-7 px-2 text-[11px] border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                    title="Duyệt tính lương OT"
                                  >
                                    <Check className="h-3 w-3 mr-0.5" />
                                    Duyệt OT
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReviewOvertime(item.id, false)}
                                    disabled={actionLoading}
                                    className="h-7 px-2 text-[11px] border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                    title="Từ chối OT"
                                  >
                                    <X className="h-3 w-3 mr-0.5" />
                                    Bác OT
                                  </Button>
                                </div>
                              )}

                              {item.status === "PENDING" && !item.isMissingClockOut && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleQuickApprove(item)}
                                  disabled={actionLoading}
                                  className="h-8 gap-1 border-emerald-500/40 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Duyệt ca</span>
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
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 2: TIMESHEET PERIOD SUMMARY (MODULE E)                          */}
      {/* ========================================================================= */}
      {viewMode === "TIMESHEET" && (
        <div className="space-y-6">
          {/* Timesheet Range Filter Bar */}
          <Card className="border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground w-full sm:w-auto">Chu kỳ D&apos;Lat:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyTimesheetPreset("PERIOD_1")}
                    className="min-h-[44px] sm:min-h-0 sm:h-8 text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                  >
                    ⚡ Kỳ 1 (01 - 15)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyTimesheetPreset("PERIOD_2")}
                    className="min-h-[44px] sm:min-h-0 sm:h-8 text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                  >
                    ⚡ Kỳ 2 (16 - Cuối tháng)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyTimesheetPreset("THIS_WEEK")}
                    className="min-h-[44px] sm:min-h-0 sm:h-8 text-xs"
                  >
                    Tuần này
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-[140px] sm:flex-none">
                    <Label htmlFor="ts-start" className="text-xs text-muted-foreground shrink-0">Từ:</Label>
                    <Input
                      id="ts-start"
                      type="date"
                      value={timesheetStart}
                      onChange={(e) => setTimesheetStart(e.target.value)}
                      className="min-h-[44px] sm:h-8 w-full sm:w-36 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-[140px] sm:flex-none">
                    <Label htmlFor="ts-end" className="text-xs text-muted-foreground shrink-0">Đến:</Label>
                    <Input
                      id="ts-end"
                      type="date"
                      value={timesheetEnd}
                      onChange={(e) => setTimesheetEnd(e.target.value)}
                      className="min-h-[44px] sm:h-8 w-full sm:w-36 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => loadTimesheetData(timesheetStart, timesheetEnd)}
                    disabled={timesheetLoading}
                    className="min-h-[44px] sm:min-h-0 sm:h-8 w-full sm:w-auto bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                  >
                    {timesheetLoading ? "Đang tải..." : "Tải dữ liệu"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timesheet Summary Table */}
          <Card className="border-border">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold">
                  Bảng Tổng hợp Công kỳ ({timesheetSummaries.length} nhân viên)
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Khoảng ngày: {formatDateVN(timesheetStart)} – {formatDateVN(timesheetEnd)} • Làm tròn 5 phút chuẩn quy chế
                </p>
              </div>
              <Link href="/payroll" className="w-full sm:w-auto shrink-0">
                <Button size="sm" variant="outline" className="min-h-[44px] sm:min-h-0 w-full sm:w-auto gap-1.5 text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20">
                  <span>Chuyển sang Tính lương & Chốt sổ</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {timesheetLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Đang tổng hợp dữ liệu bảng công kỳ...
                </div>
              ) : timesheetSummaries.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Không có dữ liệu chấm công nào trong khoảng thời gian đã chọn.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="py-3 px-3">Nhân viên</th>
                        <th className="py-3 px-3 text-center">Số ca làm</th>
                        <th className="py-3 px-3 text-right" title="T1: Tổng thời gian kế hoạch theo lịch đã duyệt">Theo lịch (T1)</th>
                        <th className="py-3 px-3 text-right" title="T2: Tổng thời gian vào/ra thực tế">Thực tế (T2)</th>
                        <th className="py-3 px-3 text-right font-semibold text-emerald-600" title="T4: Giờ công tính lương sau làm tròn 5 phút">Tính lương (T4)</th>
                        <th className="py-3 px-3 text-right">Trễ / Sớm</th>
                        <th className="py-3 px-3 text-right text-purple-600">OT chờ duyệt</th>
                        <th className="py-3 px-3 text-right text-emerald-600">OT đã duyệt</th>
                        <th className="py-3 px-3 text-center">Bất thường</th>
                        <th className="py-3 px-3 text-center">Trạng thái</th>
                        <th className="py-3 px-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {timesheetSummaries.map((s) => {
                        const hasAnomaly = s.anomalyCount > 0;
                        const hasPendingOt = s.pendingOvertimeHours > 0;
                        const isConfirmed = s.isAllApproved && !hasAnomaly && !hasPendingOt;

                        return (
                          <tr key={s.employeeId} className="hover:bg-muted/30">
                            <td className="py-3 px-3">
                              <div className="font-medium text-foreground">{s.employeeName}</div>
                              <div className="text-xs text-muted-foreground">{s.employeeCode}</div>
                            </td>
                            <td className="py-3 px-3 text-center font-medium">
                              {s.shiftCount} ca
                            </td>
                            <td className="py-3 px-3 text-right text-xs text-muted-foreground">
                              {s.totalScheduledHours.toFixed(2)}h
                            </td>
                            <td className="py-3 px-3 text-right text-xs font-medium">
                              {s.totalWorkedHours.toFixed(2)}h
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-600 text-sm">
                              {s.totalPaidHours.toFixed(2)}h
                            </td>
                            <td className="py-3 px-3 text-right text-xs">
                              {s.totalLateMinutes > 0 || s.totalEarlyLeaveMinutes > 0 ? (
                                <span className="text-amber-600">
                                  {s.totalLateMinutes > 0 && `Trễ ${s.totalLateMinutes}p `}
                                  {s.totalEarlyLeaveMinutes > 0 && `Sớm ${s.totalEarlyLeaveMinutes}p`}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">0p</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right text-xs font-medium">
                              {s.pendingOvertimeHours > 0 ? (
                                <span className="text-purple-600 font-semibold">
                                  +{s.pendingOvertimeHours.toFixed(2)}h
                                </span>
                              ) : (
                                <span className="text-muted-foreground">0h</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right text-xs font-medium">
                              {s.approvedOvertimeHours > 0 ? (
                                <span className="text-emerald-600 font-semibold">
                                  +{s.approvedOvertimeHours.toFixed(2)}h
                                </span>
                              ) : (
                                <span className="text-muted-foreground">0h</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {hasAnomaly ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  {s.anomalyCount} lỗi
                                </Badge>
                              ) : s.unscheduledCount > 0 ? (
                                <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 bg-amber-50">
                                  {s.unscheduledCount} ngoài lịch
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                  Chuẩn
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {hasAnomaly ? (
                                <Badge variant="destructive" className="text-xs">Có bất thường</Badge>
                              ) : isConfirmed ? (
                                <Badge variant="outline" className="border-emerald-500 text-emerald-600 font-semibold">
                                  Đã xác nhận
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-amber-600 border-amber-400">
                                  Chờ xác nhận
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedEmpForDetail(s)}
                                className="h-8 gap-1 text-xs"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Chi tiết</span>
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Employee Shift Breakdown Modal in Period */}
      {selectedEmpForDetail && (
        <Dialog open onOpenChange={() => setSelectedEmpForDetail(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Chi tiết ca làm việc trong kỳ — {selectedEmpForDetail.employeeName} ({selectedEmpForDetail.employeeCode})
              </DialogTitle>
              <DialogDescription>
                Khoảng ngày: {formatDateVN(timesheetStart)} – {formatDateVN(timesheetEnd)} • Tổng cộng {selectedEmpForDetail.records.length} ca
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-2">Ngày</th>
                      <th className="py-2.5 px-2">Ca làm</th>
                      <th className="py-2.5 px-2">Vào ca</th>
                      <th className="py-2.5 px-2">Tan ca</th>
                      <th className="py-2.5 px-2 text-right">Theo lịch (T1)</th>
                      <th className="py-2.5 px-2 text-right">Thực tế (T2)</th>
                      <th className="py-2.5 px-2 text-right text-emerald-600 font-semibold">Tính lương (T4)</th>
                      <th className="py-2.5 px-2 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedEmpForDetail.records.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="py-2.5 px-2 font-medium">{formatDateVN(r.workDate)}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex flex-col">
                            <span>{r.shiftName}</span>
                            {r.isUnscheduled && (
                              <span className="text-[10px] text-amber-600 font-medium">Ngoài lịch</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          {r.clockIn ? formatTimeVN(r.clockIn) : "—"}
                          {r.lateMinutes > 0 && (
                            <span className="ml-1 text-amber-600">(+{r.lateMinutes}p)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          {r.clockOut ? formatTimeVN(r.clockOut) : "—"}
                          {r.earlyLeaveMinutes > 0 && (
                            <span className="ml-1 text-rose-600">(-{r.earlyLeaveMinutes}p)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right">{r.scheduledHours.toFixed(2)}h</td>
                        <td className="py-2.5 px-2 text-right">{r.workedHours.toFixed(2)}h</td>
                        <td className="py-2.5 px-2 text-right font-bold text-emerald-600">
                          {r.paidHours !== null ? `${r.paidHours.toFixed(2)}h` : "—"}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {r.isMissingClockOut ? (
                            <Badge variant="destructive" className="text-[10px]">Quên về</Badge>
                          ) : r.status === "APPROVED" ? (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600 text-[10px]">Đã duyệt</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Chờ duyệt</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
