"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Zap,
  UserCheck,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { CandidateDto } from "@/modules/schedules/schedule.types";

interface EmergencyReplaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: {
    id: string;
    name: string;
    workDate: string;
    startTime: string;
    endTime: string;
  } | null;
  absentEmployee: {
    id: string;
    fullName: string;
    positionName?: string;
  } | null;
  onSuccess: () => void;
}

const COMMON_REASONS = [
  "Ốm sốt đột xuất",
  "Có việc gia đình gấp",
  "Hỏng xe trên đường đến quán",
  "Lý do sức khỏe",
  "Bận việc học khẩn cấp",
];

export function EmergencyReplaceModal({
  open,
  onOpenChange,
  shift,
  absentEmployee,
  onSuccess,
}: EmergencyReplaceModalProps) {
  const [candidates, setCandidates] = useState<CandidateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [reason, setReason] = useState<string>("Ốm sốt đột xuất");

  useEffect(() => {
    if (!open || !shift) {
      setCandidates([]);
      setSelectedCandidateId("");
      setError(null);
      return;
    }

    async function loadCandidates() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/shifts/${shift?.id}/candidates`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          // Filter out the absent employee
          const filtered = json.data.filter(
            (c: CandidateDto) => c.employeeId !== absentEmployee?.id,
          );
          setCandidates(filtered);

          // Auto-select the top recommended candidate if non-blocking
          const firstViable = filtered.find((c: CandidateDto) => !c.evaluation.blocking && !c.alreadyAssigned);
          if (firstViable) {
            setSelectedCandidateId(firstViable.employeeId);
          }
        } else {
          setError(json.error?.message || "Không thể tải danh sách ứng viên");
        }
      } catch (err: any) {
        setError(err.message || "Lỗi kết nối");
      } finally {
        setLoading(false);
      }
    }

    loadCandidates();
  }, [open, shift, absentEmployee]);

  async function handleConfirmReplace() {
    if (!shift || !absentEmployee || !selectedCandidateId) {
      setError("Vui lòng chọn nhân viên thay thế");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/shifts/${shift.id}/emergency-replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          absentEmployeeId: absentEmployee.id,
          replacementEmployeeId: selectedCandidateId,
          reason: reason.trim() || "Có việc đột xuất",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "Không thể thực hiện điều động ca");
      }

      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi thay ca");
    } finally {
      setSubmitting(false);
    }
  }

  if (!shift || !absentEmployee) return null;

  // Group candidates into:
  // 1. Ready & Registered (green)
  // 2. Available without conflict
  // 3. Blocked (overlapping shift / leave)
  const readyBackups = candidates.filter(
    (c) =>
      !c.alreadyAssigned &&
      !c.evaluation.blocking &&
      (c.evaluation.preference === "PREFERRED" || c.evaluation.preference === "AVAILABLE"),
  );

  const otherAvailable = candidates.filter(
    (c) =>
      !c.alreadyAssigned &&
      !c.evaluation.blocking &&
      c.evaluation.preference !== "PREFERRED" &&
      c.evaluation.preference !== "AVAILABLE",
  );

  const blockedCandidates = candidates.filter(
    (c) => c.alreadyAssigned || c.evaluation.blocking,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl max-h-[90vh] flex flex-col">
        {/* Header with emergency alert style */}
        <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-rose-700 p-5 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Zap className="h-6 w-6 text-amber-200" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white">
                Điều Động Thay Thế Ca Khẩn Cấp
              </DialogTitle>
              <DialogDescription className="text-xs text-rose-100">
                Xử lý nhân viên nghỉ đột xuất & điều động nhân sự dự phòng ngay tức thì
              </DialogDescription>
            </div>
          </div>

          {/* Shift context chip */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2 rounded-lg bg-black/20 p-2 text-xs text-white">
            <span className="font-bold text-amber-200">{shift.name}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {shift.startTime} – {shift.endTime}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {shift.workDate}
            </span>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Absent Employee Card */}
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-rose-900 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                Nhân viên báo nghỉ gấp:
              </span>
              <Badge className="bg-rose-200 text-rose-800 border-rose-300 text-[10px]">
                Nghỉ đột xuất
              </Badge>
            </div>
            <p className="mt-1 font-bold text-sm text-slate-900">
              {absentEmployee.fullName}{" "}
              {absentEmployee.positionName && (
                <span className="font-normal text-xs text-slate-500">
                  ({absentEmployee.positionName})
                </span>
              )}
            </p>

            {/* Quick reason selector */}
            <div className="mt-3">
              <span className="text-[11px] font-medium text-slate-700 block mb-1">
                Lý do nghỉ:
              </span>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      reason === r
                        ? "bg-rose-600 text-white"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do cụ thể..."
                className="text-xs h-8 bg-white"
              />
            </div>
          </div>

          {/* 2. Replacement Candidate Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Chọn nhân viên thay thế ({readyBackups.length} người sẵn sàng):
              </span>
              {loading && <span className="text-slate-400">Đang quét ca rảnh...</span>}
            </div>

            {loading ? (
              <div className="py-8 text-center text-slate-500">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                <p className="mt-2 text-xs">Đang tìm kiếm nhân sự có ca rảnh phù hợp...</p>
              </div>
            ) : candidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-slate-500">
                Không tìm thấy nhân viên nào trong hệ thống.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {/* A. Top Backups (Registered Available) */}
                {readyBackups.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      Dự phòng tối ưu (Đã đăng ký rảnh ca này)
                    </span>
                    {readyBackups.map((c) => {
                      const isSelected = selectedCandidateId === c.employeeId;
                      return (
                        <div
                          key={c.employeeId}
                          onClick={() => setSelectedCandidateId(c.employeeId)}
                          className={`rounded-xl p-3 border cursor-pointer transition-all ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-50/80 shadow-sm ring-1 ring-emerald-500"
                              : "border-slate-200 bg-white hover:border-emerald-300"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="replacement"
                                checked={isSelected}
                                onChange={() => setSelectedCandidateId(c.employeeId)}
                                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                              />
                              <div>
                                <span className="font-bold text-slate-900 text-xs">
                                  {c.fullName}
                                </span>
                                <span className="ml-1.5 text-[11px] text-slate-500 font-mono">
                                  ({c.employeeCode})
                                </span>
                              </div>
                            </div>

                            <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5">
                              {c.evaluation.preference === "PREFERRED"
                                ? "🌟 Ưu tiên làm"
                                : "✓ Rảnh ca này"}
                            </Badge>
                          </div>

                          <div className="mt-1 pl-6 flex items-center justify-between text-[11px] text-slate-500">
                            <span>Vị trí: {c.primaryPositionName}</span>
                            <span>
                              Giờ tuần:{" "}
                              <strong>
                                {Math.round(c.evaluation.projectedWeeklyMinutes / 60)}h
                              </strong>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* B. Other Available Staff */}
                {otherAvailable.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Nhân sự khả dụng khác
                    </span>
                    {otherAvailable.map((c) => {
                      const isSelected = selectedCandidateId === c.employeeId;
                      return (
                        <div
                          key={c.employeeId}
                          onClick={() => setSelectedCandidateId(c.employeeId)}
                          className={`rounded-xl p-2.5 border cursor-pointer transition-all ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-50/80 shadow-sm ring-1 ring-emerald-500"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="replacement"
                                checked={isSelected}
                                onChange={() => setSelectedCandidateId(c.employeeId)}
                                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="font-semibold text-slate-800 text-xs">
                                {c.fullName}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              Chưa đăng ký ca
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* C. Blocked Candidates (Disabled) */}
                {blockedCandidates.length > 0 && (
                  <div className="space-y-1 pt-2 opacity-60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Không thể thay ({blockedCandidates.length} người bận / trùng giờ)
                    </span>
                    {blockedCandidates.slice(0, 3).map((c) => (
                      <div
                        key={c.employeeId}
                        className="rounded-lg p-2 bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-between text-[11px]"
                      >
                        <span>{c.fullName}</span>
                        <span className="text-[10px] italic">
                          {c.alreadyAssigned ? "Đang trong ca này" : "Trùng giờ / Đang nghỉ phép"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="border-t border-slate-100 p-4 bg-slate-50 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="text-xs"
          >
            Hủy
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleConfirmReplace}
            disabled={submitting || !selectedCandidateId}
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold gap-1.5 text-xs shadow-sm"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>
              {submitting
                ? "Đang điều động..."
                : "Xác Nhận Thay Ca & Bắn Thông Báo Khẩn Cấp"}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

