"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Calendar,
  Clock,
  Lock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Sun,
  Moon,
  Coffee,
  Send,
  RotateCcw,
  Search,
  Star,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmployeeOption {
  id: string;
  employeeCode: string;
  fullName: string;
  primaryPosition?: {
    id: string;
    name: string;
    code?: string;
  };
}

interface TemplateOption {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  priority: number;
}

interface RegistrationDataResponse {
  weekStart: string;
  weekDates: string[];
  schedule: {
    id: string;
    name: string | null;
    availabilityDeadline: string | null;
    deadlineFormatted: string | null;
    status: string;
  } | null;
  isOpen: boolean;
  isDeadlinePassed: boolean;
  isScheduleLocked: boolean;
  templates: TemplateOption[];
  employees: EmployeeOption[];
  authResult?: {
    authenticated: boolean;
    pinError?: string;
    existingPreferences?: Array<{
      workDate: string;
      templateId: string;
      preference: string;
    }>;
    note?: string;
  } | null;
}

type PreferenceType = "AVAILABLE" | "PREFERRED" | "UNAVAILABLE";

const DAY_NAMES_VN: Record<number, string> = {
  0: "Chủ Nhật",
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
};

function getVietnameseInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NV";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase("vi-VN");
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toLocaleUpperCase("vi-VN");
}

function getDisplayPositionLabel(position?: { name: string; code?: string }): string {
  if (!position || position.code === "TRUONG_CA" || position.name.trim().toLowerCase() === "trưởng ca") {
    return "Nhân viên";
  }
  return position.name;
}

export default function QuickScheduleRegistrationClient({
  initialWeek,
}: {
  initialWeek: string;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RegistrationDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState<string>("");
  const [pinCode, setPinCode] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(false);

  // Registration slots: Map key = `${workDate}_${templateId}` => PreferenceType
  const [slotMap, setSlotMap] = useState<Record<string, PreferenceType>>({});
  const [desiredShifts, setDesiredShifts] = useState<number>(5);
  const [note, setNote] = useState<string>("");

  // Submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submittedSuccessfully, setSubmittedSuccessfully] = useState<boolean>(false);
  const [submitMessage, setSubmitMessage] = useState<string>("");

  // Fetch initial registration configuration
  useEffect(() => {
    async function fetchRegistrationData() {
      try {
        setLoading(true);
        setError(null);
        const query = initialWeek ? `?week=${initialWeek}` : "";
        const res = await fetch(`/api/public/schedule-registration${query}`);
        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error?.message || "Không thể tải thông tin ca làm việc");
        }

        setData(json.data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Lỗi kết nối máy chủ");
      } finally {
        setLoading(false);
      }
    }

    fetchRegistrationData();
  }, [initialWeek]);

  const draftLoadedWeekRef = useRef<string | null>(null);

  // Load draft from localStorage once per weekStart
  useEffect(() => {
    if (!data?.weekStart || draftLoadedWeekRef.current === data.weekStart) return;
    draftLoadedWeekRef.current = data.weekStart;
    try {
      const savedDraft = localStorage.getItem(`dlat_shift_draft_${data.weekStart}`);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.employeeId) {
          setSelectedEmployeeId(parsed.employeeId);
        }
        if (parsed.desiredShifts) {
          setDesiredShifts(parsed.desiredShifts);
        }
        if (parsed.note) {
          setNote(parsed.note);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [data?.weekStart]);

  // Auto-verify PIN when 4 digits are typed
  useEffect(() => {
    if (!selectedEmployeeId || pinCode.length !== 4 || !data?.weekStart) {
      if (pinCode.length < 4) {
        setPinError(null);
        setIsAuthenticated(false);
      }
      return;
    }

    let active = true;

    async function verifyPin() {
      try {
        setAuthChecking(true);
        setPinError(null);
        const url = `/api/public/schedule-registration?week=${data?.weekStart}&employeeId=${selectedEmployeeId}&pin=${pinCode}`;
        const res = await fetch(url);
        const json = await res.json();

        if (!active) return;

        if (json.ok && json.data?.authResult) {
          if (json.data.authResult.authenticated) {
            setIsAuthenticated(true);
            setPinError(null);

            // Populate existing preferences if found
            if (json.data.authResult.existingPreferences?.length > 0) {
              const newMap: Record<string, PreferenceType> = {};
              for (const item of json.data.authResult.existingPreferences) {
                newMap[`${item.workDate}_${item.templateId}`] = item.preference as PreferenceType;
              }
              setSlotMap(newMap);
              if (json.data.authResult.note) {
                setNote(json.data.authResult.note);
              }
            }
          } else {
            setIsAuthenticated(false);
            setPinError(json.data.authResult.pinError || "Mã PIN không đúng");
          }
        }
      } catch {
        if (active) {
          setPinError("Không thể kiểm tra mã PIN, vui lòng thử lại");
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    }

    verifyPin();

    return () => {
      active = false;
    };
  }, [selectedEmployeeId, pinCode, data?.weekStart]);

  // Selected employee object
  const selectedEmployee = useMemo(() => {
    return data?.employees.find((e) => e.id === selectedEmployeeId);
  }, [data?.employees, selectedEmployeeId]);

  // Filtered employees for dropdown
  const filteredEmployees = useMemo(() => {
    if (!data?.employees) return [];
    if (!searchEmployeeQuery.trim()) return data.employees;
    const q = searchEmployeeQuery.toLowerCase().trim();
    return data.employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        (e.primaryPosition?.name && e.primaryPosition.name.toLowerCase().includes(q)),
    );
  }, [data?.employees, searchEmployeeQuery]);

  // Cycle slot preference: AVAILABLE -> PREFERRED -> UNAVAILABLE -> AVAILABLE
  const toggleSlot = (workDate: string, templateId: string) => {
    const key = `${workDate}_${templateId}`;
    setSlotMap((prev) => {
      const current = prev[key];
      let next: PreferenceType = "AVAILABLE";
      if (!current || current === "UNAVAILABLE") {
        next = "AVAILABLE";
      } else if (current === "AVAILABLE") {
        next = "PREFERRED";
      } else if (current === "PREFERRED") {
        next = "UNAVAILABLE";
      }
      return { ...prev, [key]: next };
    });
  };

  // Quick action: set all templates of a kind to AVAILABLE
  const handleQuickSetAll = (templateCodeOrAll: string) => {
    if (!data) return;
    const newMap = { ...slotMap };

    data.weekDates.forEach((date) => {
      data.templates.forEach((t) => {
        const key = `${date}_${t.id}`;
        if (templateCodeOrAll === "ALL") {
          newMap[key] = "AVAILABLE";
        } else if (templateCodeOrAll === "MORNING" && (t.code === "CA_1" || t.code.includes("MORNING") || t.startTime <= "08:00")) {
          newMap[key] = "AVAILABLE";
        } else if (templateCodeOrAll === "EVENING" && (t.code === "CA_4" || t.code.includes("EVENING") || t.startTime >= "18:00")) {
          newMap[key] = "AVAILABLE";
        }
      });
    });

    setSlotMap(newMap);
  };

  // Reset all
  const handleResetSlots = () => {
    setSlotMap({});
  };

  // Count registered stats
  const stats = useMemo(() => {
    let availableCount = 0;
    let preferredCount = 0;
    let unavailableCount = 0;

    Object.values(slotMap).forEach((pref) => {
      if (pref === "AVAILABLE") availableCount++;
      if (pref === "PREFERRED") preferredCount++;
      if (pref === "UNAVAILABLE") unavailableCount++;
    });

    return {
      availableCount,
      preferredCount,
      unavailableCount,
      totalRegistered: availableCount + preferredCount,
    };
  }, [slotMap]);

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !selectedEmployeeId) return;

    if (!isAuthenticated) {
      setPinError("Vui lòng nhập chính xác 4 số cuối SĐT để xác nhận danh tính");
      return;
    }

    // Build slots array: only include slots that have been actively chosen
    // Or for full week, include all slots with current preference (defaulting to UNAVAILABLE if untouched)
    const slots: Array<{ workDate: string; templateId: string; preference: PreferenceType }> = [];
    data.weekDates.forEach((date) => {
      data.templates.forEach((t) => {
        const key = `${date}_${t.id}`;
        const pref = slotMap[key] || "UNAVAILABLE";
        slots.push({
          workDate: date,
          templateId: t.id,
          preference: pref,
        });
      });
    });

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        employeeId: selectedEmployeeId,
        pinCode: pinCode.trim(),
        weekStart: data.weekStart,
        slots,
        desiredShifts,
        note: note.trim() || undefined,
      };

      const res = await fetch("/api/public/schedule-registration/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "Không thể lưu thông tin đăng ký ca");
      }

      // Save draft key
      localStorage.setItem(
        `dlat_shift_draft_${data.weekStart}`,
        JSON.stringify({
          employeeId: selectedEmployeeId,
          desiredShifts,
          note,
          submittedAt: new Date().toISOString(),
        }),
      );

      setSubmittedSuccessfully(true);
      setSubmitMessage(json.data?.message || "Đăng ký ca làm việc thành công!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi gửi biểu mẫu");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper date formatter: "2026-11-17" -> { dayOfWeek: "Thứ Ba", dayMonth: "17/11" }
  const formatSlotDate = (isoDate?: string) => {
    if (!isoDate) return { dayOfWeek: "", dayMonth: "" };
    const parts = isoDate.split("-").map(Number);
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    if (year !== undefined && month !== undefined && day !== undefined) {
      const d = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = DAY_NAMES_VN[d.getUTCDay()] || "";
      const dayMonth = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
      return { dayOfWeek, dayMonth };
    }
    return { dayOfWeek: "", dayMonth: isoDate };
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-slate-600">Đang tải biểu mẫu đăng ký ca D&apos;lat Cafe...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-md p-4 pt-12">
        <Card className="border-rose-200 bg-rose-50 text-rose-900 shadow-sm">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-rose-500 mb-3" />
            <h3 className="text-lg font-bold">Không thể tải thông tin</h3>
            <p className="mt-2 text-sm text-rose-700">{error}</p>
            <Button
              variant="outline"
              className="mt-5 border-rose-300 bg-white hover:bg-rose-50"
              onClick={() => window.location.reload()}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Thử lại
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // Format week range label
  const firstDate = data.weekDates.length > 0 ? formatSlotDate(data.weekDates[0]).dayMonth : "";
  const lastDate = data.weekDates.length > 0
    ? formatSlotDate(data.weekDates[data.weekDates.length - 1]).dayMonth
    : "";

  return (
    <div className="mx-auto max-w-xl px-3 pt-4 sm:px-6">
      {/* BRAND HEADER */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-900 p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
              <Coffee className="h-6 w-6 text-emerald-200" />
            </div>
            <div>
              <span className="text-xs font-semibold tracking-wider text-emerald-200 uppercase">
                D&apos;lat Cafe &amp; Bistro
              </span>
              <h1 className="text-xl font-bold leading-tight">Đăng Ký Ca Làm Việc</h1>
            </div>
          </div>
        </div>

        {/* WEEK INFO & DEADLINE */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-600/50 pt-3 text-xs sm:text-sm">
          <div className="flex items-center gap-1.5 text-emerald-100 font-medium">
            <Calendar className="h-4 w-4 text-emerald-300" />
            <span>Tuần: {firstDate} – {lastDate}</span>
          </div>

          {data.schedule?.deadlineFormatted && (
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                data.isDeadlinePassed
                  ? "bg-rose-500/30 text-rose-200 border border-rose-400/40"
                  : "bg-amber-400/20 text-amber-200 border border-amber-300/30"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>
                {data.isDeadlinePassed
                  ? `Đã hết hạn (${data.schedule.deadlineFormatted})`
                  : `Hạn chót: ${data.schedule.deadlineFormatted}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* CLOSED / LOCKED WARNING */}
      {(!data.isOpen || data.isDeadlinePassed || data.isScheduleLocked) && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold">Đợt đăng ký ca đã kết thúc</h4>
              <p className="mt-1 text-xs text-amber-700">
                {data.isScheduleLocked
                  ? "Lịch làm việc tuần này đã được Quản lý chốt và khóa. Nếu cần đổi ca, bạn vui lòng liên hệ trực tiếp Quản lý ca."
                  : "Đã quá hạn chót nộp đăng ký ca. Nếu bạn chưa kịp nộp, hãy liên hệ ngay với Quản lý quán."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS SCREEN */}
      {submittedSuccessfully ? (
        <Card className="mt-5 border-emerald-200 bg-emerald-50 text-emerald-950 shadow-md">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-emerald-900">Nộp Đăng Ký Thành Công!</h2>
            <p className="mt-2 text-sm text-emerald-700 max-w-sm mx-auto">
              {submitMessage}
            </p>

            <div className="mt-5 rounded-xl bg-white/80 p-4 text-left border border-emerald-100 shadow-sm">
              <p className="text-xs text-slate-500">Nhân viên:</p>
              <p className="text-sm font-bold text-slate-800">
                {selectedEmployee?.fullName} ({selectedEmployee?.employeeCode})
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                <span>Số ca đăng ký:</span>
                <span className="font-semibold text-emerald-700">
                  {stats.availableCount} ca rảnh, {stats.preferredCount} ca ưu tiên
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                <span>Mục tiêu tuần:</span>
                <span className="font-semibold text-slate-800">{desiredShifts} ca</span>
              </div>
              {note && (
                <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">Ghi chú:</span> {note}
                </div>
              )}
            </div>

            <Button
              className="mt-6 w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
              onClick={() => {
                setSubmittedSuccessfully(false);
              }}
            >
              Chỉnh sửa lại nguyện vọng
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* REGISTRATION FORM */
        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* STEP 1: CHỌN TÊN NHÂN VIÊN */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/80 pb-3 pt-4 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-800">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                    1
                  </span>
                  Chọn Tên Nhân Viên
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {selectedEmployee ? (
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div
                      data-testid="employee-initials-avatar"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm"
                    >
                      {getVietnameseInitials(selectedEmployee.fullName)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{selectedEmployee.fullName}</h4>
                      <p className="text-xs text-slate-500">Mã NV: {selectedEmployee.employeeCode}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-slate-500 hover:text-slate-900"
                    onClick={() => {
                      setSelectedEmployeeId("");
                      setIsAuthenticated(false);
                      setPinCode("");
                      setPinError(null);
                      setSlotMap({});
                      setNote("");
                    }}
                  >
                    Đổi
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Gõ tên hoặc mã nhân viên..."
                      value={searchEmployeeQuery}
                      onChange={(e) => setSearchEmployeeQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-100 bg-white">
                    {filteredEmployees.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        Không tìm thấy nhân viên nào khớp từ khóa
                      </div>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-emerald-50/60 active:bg-emerald-100 transition-colors"
                          onClick={() => {
                            setSelectedEmployeeId(emp.id);
                            setSearchEmployeeQuery("");
                          }}
                        >
                          <div>
                            <span className="font-semibold text-slate-800">{emp.fullName}</span>
                            <span className="ml-2 text-xs text-slate-400">({emp.employeeCode})</span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {getDisplayPositionLabel(emp.primaryPosition)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* STEP 2: NHẬP MÃ PIN (4 SỐ CUỐI SĐT) */}
          {selectedEmployeeId && (
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/80 pb-3 pt-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-800">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                      2
                    </span>
                    Mã PIN Bảo Mật (4 số cuối SĐT)
                  </span>
                  {isAuthenticated && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                      ✓ Đã xác thực
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2">
                <p className="text-xs text-slate-500">
                  Nhập đúng 4 số cuối số điện thoại của bạn để chống người khác đăng ký nhầm.
                </p>

                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-[160px]">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="••••"
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-center text-lg tracking-widest font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>

                  {authChecking ? (
                    <span className="text-xs text-slate-400 animate-pulse">Đang kiểm tra...</span>
                  ) : isAuthenticated ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <Check className="h-4 w-4" /> Khớp danh tính
                    </span>
                  ) : pinError ? (
                    <span className="text-xs text-rose-600 font-medium">{pinError}</span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: BẢNG CHỌN CA 7 NGÀY (CHỈ MỞ KHI XÁC THỰC PIN THÀNH CÔNG) */}
          {selectedEmployeeId && isAuthenticated && (
            <div className="space-y-4">
              {/* LEGEND & QUICK ACTIONS */}
              <div className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Hướng dẫn chọn ca:</span>
                  <span className="text-[11px] text-slate-500">Chạm vào ca để đổi trạng thái</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                  <div className="rounded-lg bg-emerald-600 text-white font-medium py-1 px-1 flex items-center justify-center gap-1 shadow-xs">
                    <span>🟢</span> Rảnh (Sẵn sàng)
                  </div>
                  <div className="rounded-lg bg-amber-500 text-white font-medium py-1 px-1 flex items-center justify-center gap-1 shadow-xs">
                    <span>⭐</span> Ưu tiên nhất
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 text-slate-500 font-medium py-1 px-1 flex items-center justify-center gap-1">
                    <span>⚪</span> Bận (Không đi)
                  </div>
                </div>

                {/* QUICK BUTTONS */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleQuickSetAll("MORNING")}
                    className="min-h-[44px] rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 flex items-center gap-1"
                  >
                    <Sun className="h-3 w-3 text-amber-500" /> Rảnh mọi Ca 1 (Sáng)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSetAll("EVENING")}
                    className="min-h-[44px] rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 flex items-center gap-1"
                  >
                    <Moon className="h-3 w-3 text-indigo-500" /> Rảnh mọi Ca 4 (Tối)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSetAll("ALL")}
                    className="min-h-[44px] rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 flex items-center gap-1"
                  >
                    <Sparkles className="h-3 w-3 text-emerald-600" /> Rảnh cả tuần
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSlots}
                    className="min-h-[44px] rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500 border border-slate-200 hover:bg-slate-50"
                  >
                    Xóa chọn lại
                  </button>
                </div>
              </div>

              {/* 7 DAYS LIST */}
              <div className="space-y-3">
                {data.weekDates.map((date) => {
                  const { dayOfWeek, dayMonth } = formatSlotDate(date);
                  const isWeekend = dayOfWeek.includes("Bảy") || dayOfWeek.includes("Chủ Nhật");

                  return (
                    <Card
                      key={date}
                      className={`border overflow-hidden shadow-xs transition-colors ${
                        isWeekend ? "border-amber-200 bg-amber-50/20" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3.5 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${isWeekend ? "text-amber-800" : "text-slate-800"}`}>
                            {dayOfWeek}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">({dayMonth})</span>
                        </div>
                        {isWeekend && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Cuối tuần đông khách
                          </span>
                        )}
                      </div>

                      <CardContent className="p-2 sm:p-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {data.templates.map((tpl) => {
                            const key = `${date}_${tpl.id}`;
                            const pref = slotMap[key] || "UNAVAILABLE";

                            const isAvailable = pref === "AVAILABLE";
                            const isPreferred = pref === "PREFERRED";
                            const isUnavailable = pref === "UNAVAILABLE";

                            return (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={() => toggleSlot(date, tpl.id)}
                                className={`flex flex-col items-center justify-center rounded-xl p-2.5 transition-all active:scale-95 border ${
                                  isPreferred
                                    ? "bg-gradient-to-br from-amber-400 to-amber-500 text-white border-amber-500 shadow-sm font-bold"
                                    : isAvailable
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm font-semibold"
                                    : "bg-slate-50/80 text-slate-500 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                <span className="text-xs truncate w-full text-center">
                                  {tpl.name}
                                </span>
                                <span className="text-[10px] opacity-80 mt-0.5 font-mono">
                                  {tpl.startTime} - {tpl.endTime}
                                </span>

                                <div className="mt-2 flex items-center gap-1 text-[11px]">
                                  {isPreferred && (
                                    <>
                                      <Star className="h-3 w-3 fill-current" />
                                      <span>Ưu tiên</span>
                                    </>
                                  )}
                                  {isAvailable && (
                                    <>
                                      <Check className="h-3 w-3 stroke-[3]" />
                                      <span>Rảnh</span>
                                    </>
                                  )}
                                  {isUnavailable && (
                                    <span className="text-slate-400">Bận</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* STEP 4: SỐ CA MONG MUỐN & GHI CHÚ */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-slate-50/80 pb-3 pt-4 border-b border-slate-100">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                      3
                    </span>
                    Nguyện Vọng & Ghi Chú Riêng
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Số ca bạn muốn làm trong tuần này:
                    </label>
                    <div className="flex items-center gap-2">
                      {[3, 4, 5, 6, 7].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setDesiredShifts(num)}
                          className={`flex-1 rounded-xl py-2 text-xs font-bold border transition-colors ${
                            desiredShifts === num
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {num} ca
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Ghi chú gửi Quản lý (nếu có):
                    </label>
                    <textarea
                      rows={2}
                      placeholder="VD: Em bận học sáng thứ 4, thứ 6 ưu tiên ca tối giúp em..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* ERROR NOTICE */}
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* SUBMIT BUTTON */}
              <div className="sticky bottom-4 pt-2">
                <Button
                  type="submit"
                  disabled={submitting || stats.totalRegistered === 0 || !data.isOpen}
                  className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 py-6 text-base font-bold text-white shadow-xl flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Đang lưu đăng ký ca...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      <span>
                        Gửi Đăng Ký ({stats.totalRegistered} ca rảnh / ưu tiên)
                      </span>
                    </>
                  )}
                </Button>
                {stats.totalRegistered === 0 && (
                  <p className="mt-1 text-center text-[11px] text-slate-400">
                    Vui lòng chọn ít nhất 1 ca rảnh để có thể gửi biểu mẫu
                  </p>
                )}
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
