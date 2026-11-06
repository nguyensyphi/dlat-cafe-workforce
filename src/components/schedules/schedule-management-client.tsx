"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  History,
  Lock,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { SessionUser } from "@/lib/jwt";
import { formatDateVN } from "@/lib/date";
import { addDaysToDateString, listWeekDates } from "@/lib/shift-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PositionDto } from "@/modules/positions/position.types";
import type { ShiftTemplateDto } from "@/modules/shifts/shift-template.types";
import type {
  CandidateDto,
  ScheduleDetailDto,
  ScheduleRevisionDto,
  ScheduleShiftDto,
} from "@/modules/schedules/schedule.types";
import type { RecommendationResult } from "@/modules/auto-scheduling/scheduling-engine.types";
import { formatVnd } from "@/lib/currency";
import { SCHEDULE_STATUS_LABELS } from "@/modules/schedules/schedule.service";

type ViewMode = "WEEK" | "DAY" | "EMPLOYEE" | "SHIFT";

const DAY_LABELS = [
  "Chủ nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

export function ScheduleManagementClient({
  initialSchedule,
  weekStart,
  positions,
  templates,
  user,
}: {
  initialSchedule: ScheduleDetailDto | null;
  weekStart: string;
  positions: PositionDto[];
  templates: ShiftTemplateDto[];
  user: SessionUser;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [schedule, setSchedule] = useState<ScheduleDetailDto | null>(
    initialSchedule,
  );
  const [currentWeek, setCurrentWeek] = useState(weekStart);
  const [viewMode, setViewMode] = useState<ViewMode>("WEEK");
  const [selectedDay, setSelectedDay] = useState(weekStart);

  useEffect(() => {
    setSchedule(initialSchedule);
  }, [initialSchedule]);

  useEffect(() => {
    setCurrentWeek(weekStart);
    setSelectedDay(weekStart);
  }, [weekStart]);

  // Modals
  const [createScheduleOpen, setCreateScheduleOpen] = useState(false);
  const [generateFromTemplates, setGenerateFromTemplates] = useState(true);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [targetShift, setTargetShift] = useState<ScheduleShiftDto | null>(null);
  const [candidates, setCandidates] = useState<CandidateDto[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [confirmWarningOpen, setConfirmWarningOpen] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<CandidateDto | null>(
    null,
  );

  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState<ScheduleRevisionDto[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);

  const [addShiftOpen, setAddShiftOpen] = useState(false);
  const [newShiftName, setNewShiftName] = useState("Ca Tự Do");
  const [newShiftDate, setNewShiftDate] = useState(weekStart);
  const [newShiftStart, setNewShiftStart] = useState("08:00");
  const [newShiftEnd, setNewShiftEnd] = useState("14:00");
  const [newShiftBreak, setNewShiftBreak] = useState(0);
  const [newShiftStaff, setNewShiftStaff] = useState(2);

  const [autoScheduleOpen, setAutoScheduleOpen] = useState(false);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [loadingAutoSchedule, setLoadingAutoSchedule] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const isEditable =
    schedule &&
    (schedule.status === "DRAFT" || schedule.status === "PUBLISHED");
  const isOwner = user.role === "OWNER";

  function changeWeek(deltaWeeks: number) {
    const nextWeek = addDaysToDateString(currentWeek, deltaWeeks * 7);
    setCurrentWeek(nextWeek);
    startTransition(() => {
      router.push(`/schedules?week=${nextWeek}`);
    });
  }

  async function reloadSchedule() {
    try {
      const res = await fetch(`/api/schedules?week=${currentWeek}`);
      const json = await res.json();
      if (json.ok) {
        setSchedule(json.data);
      }
    } catch {
      // ignore
    }
  }

  async function handleCreateWeek() {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: currentWeek,
          generateFromTemplates,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMessage(json.error?.message || "Không thể tạo lịch tuần");
        return;
      }
      setSchedule(json.data);
      setCreateScheduleOpen(false);
      router.refresh();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStatusChange(
    action: "PUBLISH" | "LOCK" | "UNLOCK" | "ARCHIVE",
  ) {
    if (!schedule) return;
    const confirmText = {
      PUBLISH: "Công bố lịch làm việc chính thức cho toàn bộ nhân viên?",
      LOCK: "Khóa lịch tuần này? Sau khi khóa sẽ không thể chỉnh sửa ca/nhân sự.",
      UNLOCK: "Mở khóa lịch tuần để tiếp tục chỉnh sửa?",
      ARCHIVE: "Lưu trữ lịch tuần này vào danh mục lịch cũ?",
    }[action];

    if (!window.confirm(confirmText)) return;

    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/schedules/${schedule.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMessage(json.error?.message || "Thao tác thất bại");
        return;
      }
      setSchedule(json.data);
      router.refresh();
    } finally {
      setActionLoading(false);
    }
  }

  async function openAssignModal(shift: ScheduleShiftDto) {
    setTargetShift(shift);
    setAssignModalOpen(true);
    setLoadingCandidates(true);
    setCandidates([]);
    try {
      const res = await fetch(`/api/shifts/${shift.id}/candidates`);
      const json = await res.json();
      if (json.ok) {
        setCandidates(json.data);
      }
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function handleAssignCandidate(
    candidate: CandidateDto,
    allowWarnings = false,
  ) {
    if (!targetShift) return;

    const warnings = candidate.evaluation.conflicts.filter(
      (c) => c.severity === "WARNING",
    );
    if (warnings.length > 0 && !allowWarnings) {
      setPendingCandidate(candidate);
      setConfirmWarningOpen(true);
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/shifts/${targetShift.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: candidate.employeeId,
          positionId: candidate.suggestedPositionId,
          allowWarnings: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMessage(json.error?.message || "Không thể phân công nhân viên");
        return;
      }
      setConfirmWarningOpen(false);
      setAssignModalOpen(false);
      await reloadSchedule();
      router.refresh();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!window.confirm("Gỡ nhân viên khỏi ca làm này?")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.ok) {
        await reloadSchedule();
        router.refresh();
      } else {
        alert(json.error?.message || "Không thể gỡ phân công");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function openRevisions() {
    if (!schedule) return;
    setRevisionsOpen(true);
    setLoadingRevisions(true);
    try {
      const res = await fetch(`/api/schedules/${schedule.id}/revisions`);
      const json = await res.json();
      if (json.ok) {
        setRevisions(json.data);
      }
    } finally {
      setLoadingRevisions(false);
    }
  }

  async function handlePreviewAutoSchedule() {
    if (!schedule) return;
    setAutoScheduleOpen(true);
    setLoadingAutoSchedule(true);
    setRecommendation(null);
    try {
      const res = await fetch(`/api/schedules/${schedule.id}/auto-schedule/preview`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok) {
        setRecommendation(json.data);
      } else {
        alert(json.error?.message || "Không thể tạo gợi ý xếp ca");
        setAutoScheduleOpen(false);
      }
    } finally {
      setLoadingAutoSchedule(false);
    }
  }

  async function handleApplyAutoSchedule() {
    if (!schedule) return;
    if (
      !window.confirm(
        "Áp dụng kết quả xếp ca tự động? Các ca chưa ghim sẽ được cập nhật.",
      )
    )
      return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/schedules/${schedule.id}/auto-schedule/apply`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok) {
        setAutoScheduleOpen(false);
        await reloadSchedule();
        router.refresh();
      } else {
        alert(json.error?.message || "Không thể áp dụng xếp ca");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreateShift() {
    if (!schedule) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/schedules/${schedule.id}/shifts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate: newShiftDate,
          name: newShiftName,
          startTime: newShiftStart,
          endTime: newShiftEnd,
          breakMinutes: Number(newShiftBreak),
          requiredStaff: Number(newShiftStaff),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setAddShiftOpen(false);
        await reloadSchedule();
        router.refresh();
      } else {
        alert(json.error?.message || "Không thể thêm ca làm việc");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteShift(shiftId: string) {
    if (!window.confirm("Xóa hoặc hủy ca làm việc này?")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.ok) {
        await reloadSchedule();
        router.refresh();
      } else {
        alert(json.error?.message || "Không thể xóa ca làm");
      }
    } finally {
      setActionLoading(false);
    }
  }

  const weekDates = listWeekDates(currentWeek);

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Quản lý Lịch làm việc
            </h1>
            {schedule && (
              <Badge
                variant={
                  schedule.status === "PUBLISHED"
                    ? "default"
                    : schedule.status === "LOCKED"
                    ? "warning"
                    : schedule.status === "ARCHIVED"
                    ? "secondary"
                    : "outline"
                }
                className="text-xs font-semibold"
              >
                {SCHEDULE_STATUS_LABELS[schedule.status]}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Xếp ca 7 ngày, kiểm tra xung đột thời gian thực và quản lý định biên
            nhân sự
          </p>
        </div>

        {/* Week Selector Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-white shadow-sm p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => changeWeek(-1)}
              title="Tuần trước"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-xs font-medium text-slate-700 min-w-[140px] text-center">
              {formatDateVN(currentWeek)} –{" "}
              {formatDateVN(addDaysToDateString(currentWeek, 6))}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => changeWeek(1)}
              title="Tuần sau"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {schedule ? (
            <div className="flex items-center gap-2">
              {schedule.status === "DRAFT" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePreviewAutoSchedule}
                    className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Tự động xếp ca</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleStatusChange("PUBLISH")}
                    disabled={actionLoading}
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Công bố lịch</span>
                  </Button>
                </>
              )}

              {schedule.status === "PUBLISHED" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange("LOCK")}
                  disabled={actionLoading}
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Khóa lịch</span>
                </Button>
              )}

              {schedule.status === "LOCKED" && isOwner && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange("UNLOCK")}
                  disabled={actionLoading}
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>Mở khóa</span>
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openRevisions}
                title="Lịch sử phiên bản"
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Lịch sử ({schedule.revisionCount})</span>
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setGenerateFromTemplates(true);
                setCreateScheduleOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              <span>Tạo lịch tuần</span>
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs underline text-red-600"
          >
            Đóng
          </button>
        </div>
      )}

      {/* KPI Totals Bar */}
      {schedule && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="py-2.5 px-4 shadow-none">
            <p className="text-xs text-muted-foreground">Tổng số ca làm</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              {schedule.totals.shiftCount} ca
            </p>
          </Card>
          <Card className="py-2.5 px-4 shadow-none">
            <p className="text-xs text-muted-foreground">Định biên / Đã xếp</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              {schedule.totals.filledSlots} / {schedule.totals.requiredSlots} vị trí
            </p>
          </Card>
          <Card className="py-2.5 px-4 shadow-none">
            <p className="text-xs text-muted-foreground">Ca còn thiếu người</p>
            <p
              className={`text-xl font-bold mt-0.5 ${
                schedule.totals.understaffedShiftCount > 0
                  ? "text-amber-600"
                  : "text-emerald-600"
              }`}
            >
              {schedule.totals.understaffedShiftCount} ca
            </p>
          </Card>
          <Card className="py-2.5 px-4 shadow-none">
            <p className="text-xs text-muted-foreground">Tổng giờ công tuần</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              {Math.round((schedule.totals.totalAssignedMinutes / 60) * 10) / 10} giờ
            </p>
          </Card>
        </div>
      )}

      {/* View Mode Switcher */}
      <div className="flex items-center justify-between gap-3 bg-slate-50 border border-border rounded-lg p-1.5">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={viewMode === "WEEK" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("WEEK")}
          >
            Theo Tuần
          </Button>
          <Button
            type="button"
            variant={viewMode === "DAY" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("DAY")}
          >
            Theo Ngày
          </Button>
          <Button
            type="button"
            variant={viewMode === "EMPLOYEE" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("EMPLOYEE")}
          >
            Theo Nhân viên
          </Button>
          <Button
            type="button"
            variant={viewMode === "SHIFT" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("SHIFT")}
          >
            Danh sách Ca
          </Button>
        </div>

        {schedule && isEditable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setNewShiftDate(currentWeek);
              setAddShiftOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Thêm ca mới</span>
          </Button>
        )}
      </div>

      {/* If No Schedule for this Week */}
      {!schedule ? (
        <Card className="border-dashed p-10 text-center">
          <Calendar className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">
            Chưa có lịch làm việc cho tuần {formatDateVN(currentWeek)}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Bạn có thể khởi tạo bản nháp mới tự động từ các khung ca mẫu đã cấu
            hình hoặc xếp thủ công theo ý muốn.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setGenerateFromTemplates(true);
              setCreateScheduleOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Tạo lịch nháp tuần này</span>
          </Button>
        </Card>
      ) : (
        <>
          {/* VIEW 1: WEEKLY VIEW (7 COLUMNS) */}
          {viewMode === "WEEK" && (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {weekDates.map((dateStr, idx) => {
                const shiftsOfDay = schedule.shifts.filter(
                  (s) => s.workDate === dateStr && s.status !== "CANCELLED",
                );
                const dayIndex = (idx + 1) % 7; // Monday = 1 ... Sunday = 0
                const isToday =
                  new Date().toISOString().slice(0, 10) === dateStr;

                return (
                  <div
                    key={dateStr}
                    className={`flex flex-col rounded-xl border bg-card p-3 space-y-3 min-h-[360px] ${
                      isToday
                        ? "border-emerald-500 shadow-sm ring-1 ring-emerald-500"
                        : "border-border"
                    }`}
                  >
                    <div className="border-b border-border pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900">
                          {DAY_LABELS[dayIndex]}
                        </span>
                        {isToday && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            Hôm nay
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {dateStr.slice(8, 10)}/{dateStr.slice(5, 7)}
                      </p>
                    </div>

                    <div className="flex-1 space-y-2.5">
                      {shiftsOfDay.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center py-6">
                          Không có ca làm
                        </p>
                      ) : (
                        shiftsOfDay.map((shift) => (
                          <ShiftCardCompact
                            key={shift.id}
                            shift={shift}
                            isEditable={Boolean(isEditable)}
                            onAssign={() => openAssignModal(shift)}
                            onRemoveAssignment={handleRemoveAssignment}
                            onDeleteShift={() => handleDeleteShift(shift.id)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: DAILY VIEW */}
          {viewMode === "DAY" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
                {weekDates.map((dateStr, idx) => {
                  const dayIdx = (idx + 1) % 7;
                  const active = selectedDay === dateStr;
                  const count = schedule.shifts.filter(
                    (s) => s.workDate === dateStr && s.status !== "CANCELLED",
                  ).length;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setSelectedDay(dateStr)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? "bg-emerald-600 text-white"
                          : "bg-white border border-border text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{DAY_LABELS[dayIdx]} ({dateStr.slice(8, 10)}/{dateStr.slice(5, 7)})</span>
                      <span className="ml-1.5 opacity-80">[{count} ca]</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                {schedule.shifts
                  .filter(
                    (s) =>
                      s.workDate === selectedDay && s.status !== "CANCELLED",
                  )
                  .map((shift) => (
                    <ShiftCardDetailed
                      key={shift.id}
                      shift={shift}
                      isEditable={Boolean(isEditable)}
                      onAssign={() => openAssignModal(shift)}
                      onRemoveAssignment={handleRemoveAssignment}
                      onDeleteShift={() => handleDeleteShift(shift.id)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* VIEW 3: EMPLOYEE VIEW */}
          {viewMode === "EMPLOYEE" && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Phân bổ giờ công tuần theo từng nhân sự
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Theo dõi định mức tuần và phát hiện nhân viên vượt/thiếu giờ
                  </p>
                </div>
              </div>

              <div className="divide-y divide-border">
                {schedule.employeeSummaries.map((emp) => {
                  const hours = Math.round((emp.assignedMinutes / 60) * 10) / 10;
                  const isOverLimit = hours > emp.maxWeeklyHours;
                  const shiftsOfEmp = schedule.shifts.filter((s) =>
                    s.assignments.some((a) => a.employeeId === emp.employeeId),
                  );

                  return (
                    <div
                      key={emp.employeeId}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {emp.fullName}
                          </p>
                          <Badge variant="outline" className="text-[11px]">
                            {emp.primaryPositionName}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Mã: {emp.employeeCode} • Mục tiêu: {emp.weeklyTargetHours}h • Tối đa: {emp.maxWeeklyHours}h
                        </p>
                      </div>

                      <div className="flex-1 flex flex-wrap gap-1.5">
                        {shiftsOfEmp.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">
                            Chưa có ca làm nào trong tuần
                          </span>
                        ) : (
                          shiftsOfEmp.map((s) => (
                            <Badge
                              key={s.id}
                              variant="secondary"
                              className="text-xs gap-1"
                            >
                              <span>
                                {s.workDate.slice(8, 10)}/{s.workDate.slice(5, 7)}:
                              </span>
                              <span>{s.name} ({s.startTime}–{s.endTime})</span>
                            </Badge>
                          ))
                        )}
                      </div>

                      <div className="text-right min-w-[120px]">
                        <p
                          className={`text-base font-bold ${
                            isOverLimit ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {hours} giờ
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {emp.shiftCount} ca làm
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 4: SHIFT FLAT LIST */}
          {viewMode === "SHIFT" && (
            <div className="space-y-3">
              {schedule.shifts.map((shift) => (
                <div
                  key={shift.id}
                  className="rounded-lg border border-border bg-card p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">
                        {formatDateVN(shift.workDate)}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-900">
                        {shift.name}
                      </h4>
                      <Badge variant="outline">
                        {shift.startTime} – {shift.endTime}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-xs text-slate-500">Nhân sự:</span>
                      {shift.assignments.length === 0 ? (
                        <span className="text-xs text-amber-600 font-medium">
                          Chưa phân công
                        </span>
                      ) : (
                        shift.assignments.map((a) => (
                          <Badge
                            key={a.id}
                            variant="secondary"
                            className="text-xs gap-1"
                          >
                            <span>{a.employeeName}</span>
                            <span className="opacity-70">({a.positionName})</span>
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">
                      Định biên: {shift.assignedCount}/{shift.requiredStaff}
                    </span>
                    {isEditable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openAssignModal(shift)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Phân công</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODAL 1: Create Schedule for Week */}
      <Dialog open={createScheduleOpen} onOpenChange={setCreateScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tạo lịch làm việc tuần mới</DialogTitle>
            <DialogDescription>
              Khởi tạo bảng phân ca cho tuần bắt đầu từ Thứ Hai{" "}
              {formatDateVN(currentWeek)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <label className="flex items-start gap-3 rounded-lg border border-border p-3.5 bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={generateFromTemplates}
                onChange={(e) => setGenerateFromTemplates(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              <div className="text-xs">
                <p className="font-semibold text-slate-900">
                  Tự động sinh ca từ {templates.length} khung ca mẫu
                </p>
                <p className="text-muted-foreground mt-0.5">
                  Tự động tạo Ca Sáng, Ca Chiều, Ca Tối cho đủ 7 ngày trong tuần
                  kèm định biên vị trí tương ứng.
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateScheduleOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleCreateWeek}
              disabled={actionLoading}
            >
              {actionLoading ? "Đang tạo..." : "Xác nhận tạo lịch"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Assign Candidates */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              Phân công nhân sự: {targetShift?.name}
            </DialogTitle>
            <DialogDescription>
              {targetShift && (
                <span>
                  {formatDateVN(targetShift.workDate)} ({targetShift.startTime} –{" "}
                  {targetShift.endTime}) • Yêu cầu {targetShift.requiredStaff} người
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {loadingCandidates ? (
            <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Đang tính toán xung đột &amp; gợi ý ứng viên phù hợp...</span>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
              {candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Không tìm thấy nhân viên khả dụng
                </p>
              ) : (
                candidates.map((cand) => {
                  const blocking = cand.evaluation.blocking;
                  const warnings = cand.evaluation.conflicts.filter(
                    (c) => c.severity === "WARNING",
                  );
                  const isPref = cand.evaluation.preference === "PREFERRED";
                  const isUnavail = cand.evaluation.preference === "UNAVAILABLE";

                  return (
                    <div
                      key={cand.employeeId}
                      className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${
                        cand.alreadyAssigned
                          ? "bg-slate-50 border-slate-200 opacity-60"
                          : blocking
                          ? "bg-red-50/40 border-red-200"
                          : warnings.length > 0
                          ? "bg-amber-50/40 border-amber-200"
                          : "bg-white border-border"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {cand.fullName}
                          </p>
                          <Badge variant="outline" className="text-[11px]">
                            {cand.primaryPositionName}
                          </Badge>
                          {isPref && (
                            <Badge variant="default" className="text-[10px]">
                              Thích ca này
                            </Badge>
                          )}
                          {isUnavail && (
                            <Badge variant="warning" className="text-[10px]">
                              Báo bận
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground mt-0.5">
                          Mã: {cand.employeeCode} • Giờ tuần dự kiến:{" "}
                          <span className="font-medium text-slate-700">
                            {Math.round(
                              (cand.evaluation.projectedWeeklyMinutes / 60) * 10,
                            ) / 10}
                            h
                          </span>
                        </p>

                        {/* Conflicts display */}
                        {cand.evaluation.conflicts.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {cand.evaluation.conflicts.map((c, i) => (
                              <p
                                key={i}
                                className={`text-[11px] flex items-center gap-1 ${
                                  c.severity === "BLOCKING"
                                    ? "text-red-700 font-medium"
                                    : c.severity === "WARNING"
                                    ? "text-amber-800"
                                    : "text-slate-500"
                                }`}
                              >
                                {c.severity === "BLOCKING" && (
                                  <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" />
                                )}
                                {c.severity === "WARNING" && (
                                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                                )}
                                <span>{c.message}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        {cand.alreadyAssigned ? (
                          <Badge variant="secondary">Đã gán</Badge>
                        ) : blocking ? (
                          <Badge variant="destructive">Không thể gán</Badge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant={warnings.length > 0 ? "outline" : "default"}
                            disabled={actionLoading}
                            onClick={() => handleAssignCandidate(cand, false)}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>Gán vào ca</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Confirm Warnings */}
      <Dialog open={confirmWarningOpen} onOpenChange={setConfirmWarningOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span>Xác nhận phân công (Có cảnh báo)</span>
            </DialogTitle>
            <DialogDescription>
              Nhân viên{" "}
              <strong>{pendingCandidate?.fullName}</strong> có các cảnh báo sau:
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5 my-2">
            {pendingCandidate?.evaluation.conflicts
              .filter((c) => c.severity === "WARNING")
              .map((c, i) => (
                <p key={i} className="text-xs text-amber-900 font-medium">
                  • {c.message}
                </p>
              ))}
          </div>

          <p className="text-xs text-slate-600">
            Bạn có chắc chắn muốn bỏ qua các cảnh báo trên và tiếp tục phân công?
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmWarningOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() =>
                pendingCandidate && handleAssignCandidate(pendingCandidate, true)
              }
              disabled={actionLoading}
            >
              Vẫn phân công
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Revisions History */}
      <Dialog open={revisionsOpen} onOpenChange={setRevisionsOpen}>
        <DialogContent className="max-w-xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Lịch sử thay đổi lịch tuần</DialogTitle>
            <DialogDescription>
              Toàn bộ phiên bản và thao tác chỉnh sửa được lưu vết tự động
            </DialogDescription>
          </DialogHeader>

          {loadingRevisions ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Đang tải lịch sử phiên bản...
            </div>
          ) : revisions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Chưa có phiên bản thay đổi nào
            </p>
          ) : (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 divide-y divide-border">
              {revisions.map((rev) => (
                <div key={rev.id} className="pt-3 first:pt-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">
                      Phiên bản #{rev.revisionNumber} — {rev.action}
                    </span>
                    <span className="text-muted-foreground">
                      {rev.createdAt.slice(11, 16)} {rev.createdAt.slice(8, 10)}/{rev.createdAt.slice(5, 7)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mt-1">{rev.summary}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Người thực hiện: {rev.changedByName || "Hệ thống"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 5: Add Shift Manually */}
      <Dialog open={addShiftOpen} onOpenChange={setAddShiftOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm ca làm việc mới</DialogTitle>
            <DialogDescription>
              Tạo ca làm phát sinh trong tuần {formatDateVN(currentWeek)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Tên ca</Label>
              <Input
                value={newShiftName}
                onChange={(e) => setNewShiftName(e.target.value)}
                placeholder="VD: Ca Tăng Cường"
              />
            </div>

            <div className="space-y-1">
              <Label>Ngày làm việc</Label>
              <select
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                value={newShiftDate}
                onChange={(e) => setNewShiftDate(e.target.value)}
              >
                {weekDates.map((dateStr, idx) => (
                  <option key={dateStr} value={dateStr}>
                    {DAY_LABELS[(idx + 1) % 7]} ({formatDateVN(dateStr)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Giờ bắt đầu</Label>
                <Input
                  type="time"
                  value={newShiftStart}
                  onChange={(e) => setNewShiftStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Giờ kết thúc</Label>
                <Input
                  type="time"
                  value={newShiftEnd}
                  onChange={(e) => setNewShiftEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Phút nghỉ</Label>
                <Input
                  type="number"
                  min={0}
                  value={newShiftBreak}
                  onChange={(e) => setNewShiftBreak(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Số người cần</Label>
                <Input
                  type="number"
                  min={1}
                  value={newShiftStaff}
                  onChange={(e) => setNewShiftStaff(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Các vị trí sẵn có trong quán</Label>
              <div className="flex flex-wrap gap-1 p-2 rounded border border-border bg-slate-50 text-xs">
                {positions.slice(0, 6).map((pos) => (
                  <Badge key={pos.id} variant="outline" className="text-[10px]">
                    {pos.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddShiftOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleCreateShift}
              disabled={actionLoading}
            >
              Thêm ca
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 6: Auto Schedule Recommendation */}
      <Dialog open={autoScheduleOpen} onOpenChange={setAutoScheduleOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              <span>Đề xuất Xếp ca Tự động</span>
            </DialogTitle>
            <DialogDescription>
              Động cơ tự động giải thuật toán cân bằng ràng buộc cứng và mềm
            </DialogDescription>
          </DialogHeader>

          {loadingAutoSchedule ? (
            <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
              <span>Đang tính toán tối ưu lịch ca...</span>
            </div>
          ) : !recommendation ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Không thể tạo gợi ý xếp ca
            </p>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                  <p className="text-[11px] text-emerald-700">Lấp đầy</p>
                  <p className="text-lg font-bold text-emerald-900 mt-0.5">
                    {recommendation.filledSlots} / {recommendation.totalSlots} vị trí
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-border p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">Chi phí ước tính</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">
                    {formatVnd(recommendation.estimatedTotalLaborCostVND)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-border p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">Thời gian tính</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">
                    {recommendation.executionTimeMs} ms
                  </p>
                </div>
              </div>

              {recommendation.unfilledShifts.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5 text-xs text-amber-900">
                  <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Còn {recommendation.unfilledShifts.length} ca chưa lấp đầy:</span>
                  </p>
                  {recommendation.unfilledShifts.map((u, i) => (
                    <div key={i} className="pl-5 text-[11px]">
                      • <strong>{u.shiftName}</strong> ({formatDateVN(u.workDate)}): {u.reasons.join(", ") || "Thiếu nhân sự đáp ứng"}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-900">
                  Phân bổ giờ công dự kiến cho nhân sự:
                </p>
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {recommendation.employeeSummaries.map((emp) => (
                    <div
                      key={emp.employeeId}
                      className="p-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-900">
                          {emp.fullName}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          ({emp.shiftCount} ca làm)
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-emerald-700">
                          {Math.round((emp.assignedMinutes / 60) * 10) / 10}h
                        </span>
                        <span className="text-muted-foreground ml-2">
                          ~ {formatVnd(emp.estimatedWageVND)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAutoScheduleOpen(false)}
            >
              Đóng
            </Button>
            {recommendation && (
              <Button
                type="button"
                onClick={handleApplyAutoSchedule}
                disabled={actionLoading}
              >
                Áp dụng vào lịch tuần
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Compact shift card for 7-day grid
function ShiftCardCompact({
  shift,
  isEditable,
  onAssign,
  onRemoveAssignment,
  onDeleteShift,
}: {
  shift: ScheduleShiftDto;
  isEditable: boolean;
  onAssign: () => void;
  onRemoveAssignment: (id: string) => void;
  onDeleteShift: () => void;
}) {
  const isFilled = shift.assignedCount >= shift.requiredStaff;

  return (
    <div className="rounded-lg border border-border bg-slate-50/70 p-2.5 text-xs space-y-2">
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="font-semibold text-slate-900 leading-snug">
            {shift.name}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {shift.startTime}–{shift.endTime}
          </p>
        </div>
        <Badge
          variant={isFilled ? "default" : "warning"}
          className="text-[10px] px-1 py-0 shrink-0"
        >
          {shift.assignedCount}/{shift.requiredStaff}
        </Badge>
      </div>

      <div className="space-y-1">
        {shift.assignments.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-1 rounded bg-white border border-border px-1.5 py-1 text-[11px]"
          >
            <span className="truncate font-medium text-slate-800">
              {a.employeeName}
            </span>
            {isEditable && (
              <button
                type="button"
                onClick={() => onRemoveAssignment(a.id)}
                className="text-slate-400 hover:text-red-600 shrink-0"
                title="Gỡ khỏi ca"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {isEditable && (
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <button
            type="button"
            onClick={onAssign}
            className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            <span>Thêm</span>
          </button>
          <button
            type="button"
            onClick={onDeleteShift}
            className="text-[11px] text-slate-400 hover:text-red-600"
            title="Xóa ca"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// Detailed shift card for day view
function ShiftCardDetailed({
  shift,
  isEditable,
  onAssign,
  onRemoveAssignment,
  onDeleteShift,
}: {
  shift: ScheduleShiftDto;
  isEditable: boolean;
  onAssign: () => void;
  onRemoveAssignment: (id: string) => void;
  onDeleteShift: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{shift.name}</CardTitle>
              <Badge variant="outline">
                {shift.startTime} – {shift.endTime} (nghỉ {shift.breakMinutes}p)
              </Badge>
              {shift.isPeak && <Badge variant="warning">Cao điểm</Badge>}
            </div>
            <CardDescription className="mt-1">
              Định biên: {shift.assignedCount} / {shift.requiredStaff} nhân sự
            </CardDescription>
          </div>

          {isEditable && (
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={onAssign}>
                <UserPlus className="h-3.5 w-3.5" />
                <span>Thêm nhân sự</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onDeleteShift}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {shift.requirements.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="text-muted-foreground mr-1">Vị trí:</span>
            {shift.requirements.map((r) => (
              <Badge key={r.positionId} variant="secondary">
                {r.positionName}: {r.assignedCount}/{r.minCount}
              </Badge>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {shift.assignments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-slate-50 p-2.5 text-xs"
            >
              <div>
                <p className="font-semibold text-slate-900">{a.employeeName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {a.positionName} • {a.employeeCode}
                </p>
                {a.explanation && (
                  <p className="text-[10px] text-amber-700 italic mt-0.5">
                    {a.explanation}
                  </p>
                )}
              </div>
              {isEditable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveAssignment(a.id)}
                  className="h-7 px-2 text-red-600 hover:text-red-700"
                >
                  Gỡ
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
