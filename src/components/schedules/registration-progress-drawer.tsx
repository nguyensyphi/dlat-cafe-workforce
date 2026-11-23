"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Users,
  CheckCircle2,
  RefreshCw,
  QrCode,
  UserX,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeVN } from "@/lib/date";

interface RegistrationEmployeeRow {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  primaryPositionName: string;
  submissionStatus: "SUBMITTED" | "DRAFT";
  preferredCount: number;
  availableCount: number;
  unavailableCount: number;
  updatedAt: string | null;
}

interface OverviewData {
  weekStart: string;
  weekEnd: string;
  deadlineAt: string;
  deadlinePassed: boolean;
  totalEmployees: number;
  submittedEmployees: number;
  employees: RegistrationEmployeeRow[];
}

interface RegistrationProgressDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  onOpenQrModal?: () => void;
}

export function RegistrationProgressDrawer({
  open,
  onOpenChange,
  weekStart,
  onOpenQrModal,
}: RegistrationProgressDrawerProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"SUBMITTED" | "MISSING">("SUBMITTED");

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/availability/overview?week=${weekStart}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "Không thể tải tiến độ nộp đăng ký");
      }
      setData(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi nạp dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    if (open && weekStart) {
      fetchOverview();
    }
  }, [open, weekStart, fetchOverview]);

  const submittedList = data?.employees.filter((e) => e.submissionStatus === "SUBMITTED") || [];
  const missingList = data?.employees.filter((e) => e.submissionStatus !== "SUBMITTED") || [];

  const percentage = data?.totalEmployees
    ? Math.round((data.submittedEmployees / data.totalEmployees) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-xl p-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="bg-slate-900 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  Tiến Độ Đăng Ký Ca Làm Việc
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Tuần: {weekStart} {data?.deadlineAt && `• Hạn nộp: ${formatDateTimeVN(data.deadlineAt)}`}
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={fetchOverview}
              disabled={loading}
              className="text-slate-300 hover:text-white hover:bg-slate-800 h-8 px-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 rounded-xl bg-slate-800/80 p-3 border border-slate-700/60">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-200">
                Đã nộp: {data?.submittedEmployees ?? 0}/{data?.totalEmployees ?? 0} nhân sự
              </span>
              <span className={percentage >= 80 ? "text-emerald-400" : "text-amber-400"}>
                {percentage}%
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-700">
              <div
                className={`h-full transition-all duration-500 ${
                  percentage >= 80 ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tabs & List */}
        <div className="p-4">
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("SUBMITTED")}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === "SUBMITTED"
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Đã nộp ({submittedList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("MISSING")}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === "MISSING"
                  ? "bg-white text-rose-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserX className="h-3.5 w-3.5 text-rose-600" />
              <span>Chưa nộp ({missingList.length})</span>
            </button>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="p-4 text-center text-xs text-rose-600">{error}</div>
          ) : (
            <div className="mt-3 max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
              {activeTab === "SUBMITTED" ? (
                submittedList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Chưa có nhân viên nào nộp đăng ký ca cho tuần này.
                  </div>
                ) : (
                  submittedList.map((emp) => (
                    <div
                      key={emp.employeeId}
                      className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {emp.fullName}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            ({emp.employeeCode})
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {emp.primaryPositionName}
                        </p>
                      </div>

                      <div className="text-right">
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                          {emp.availableCount} ca rảnh, {emp.preferredCount} ưu tiên
                        </Badge>
                        {emp.updatedAt && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Nộp: {formatDateTimeVN(emp.updatedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : missingList.length === 0 ? (
                <div className="p-6 text-center text-xs text-emerald-700 font-medium">
                  🎉 Tuyệt vời! Toàn bộ 100% nhân viên đã gửi đăng ký ca.
                </div>
              ) : (
                missingList.map((emp) => (
                  <div
                    key={emp.employeeId}
                    className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {emp.fullName}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({emp.employeeCode})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {emp.primaryPositionName}
                      </p>
                    </div>

                    <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[10px]">
                      Chưa gửi
                    </Badge>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Action footer */}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            {onOpenQrModal && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onOpenQrModal();
                }}
                className="gap-1.5 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>Xem Mã QR Đăng Ký</span>
              </Button>
            )}

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="ml-auto text-xs bg-slate-900 hover:bg-slate-800 text-white"
            >
              Đóng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

