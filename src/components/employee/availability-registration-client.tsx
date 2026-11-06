"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Heart,
  Save,
  XCircle,
} from "lucide-react";
import type { AvailabilityPreference } from "@prisma/client";
import { formatDateVN } from "@/lib/date";
import { addDaysToDateString } from "@/lib/shift-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { EmployeeWeekAvailabilityDto } from "@/modules/availability/availability.types";

const DAY_NAMES = [
  "Chủ nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

export function AvailabilityRegistrationClient({
  initialData,
  weekStart,
}: {
  initialData: EmployeeWeekAvailabilityDto;
  weekStart: string;
}) {
  const router = useRouter();
  const [currentWeek, setCurrentWeek] = useState(weekStart);
  const [data, setData] = useState(initialData);

  // Map of `${workDate}_${templateId}` -> preference
  const [preferences, setPreferences] = useState<Record<string, AvailabilityPreference>>(() => {
    const map: Record<string, AvailabilityPreference> = {};
    for (const day of initialData.days) {
      for (const slot of day.slots) {
        map[`${slot.workDate}_${slot.templateId}`] = slot.preference;
      }
    }
    return map;
  });

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function changeWeek(delta: number) {
    const next = addDaysToDateString(currentWeek, delta * 7);
    setCurrentWeek(next);
    router.push(`/employee/availability?week=${next}`);
  }

  function setSlotPref(
    workDate: string,
    templateId: string,
    pref: AvailabilityPreference,
  ) {
    setPreferences((prev) => ({
      ...prev,
      [`${workDate}_${templateId}`]: pref,
    }));
  }

  async function handleSave() {
    setSaving(true);
    setStatusMessage(null);

    const slots = [];
    for (const day of data.days) {
      for (const slot of day.slots) {
        const pref = preferences[`${slot.workDate}_${slot.templateId}`] ?? "AVAILABLE";
        slots.push({
          workDate: slot.workDate,
          templateId: slot.templateId,
          preference: pref,
        });
      }
    }

    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: currentWeek,
          slots,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatusMessage({
          type: "error",
          text: json.error?.message || "Không thể lưu lịch rảnh",
        });
        return;
      }

      setData(json.data);
      setStatusMessage({
        type: "success",
        text: "Đã lưu đăng ký lịch rảnh thành công!",
      });
      router.refresh();
    } catch {
      setStatusMessage({
        type: "error",
        text: "Đã xảy ra lỗi kết nối, vui lòng thử lại",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Week Selector */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Đăng ký Lịch rảnh
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Khai báo các ca bạn có thể đi làm hoặc bận trong tuần
          </p>
        </div>

        <div className="flex items-center rounded-lg border border-border bg-white p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => changeWeek(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs font-medium text-slate-700">
            {formatDateVN(currentWeek)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => changeWeek(1)}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Deadline Info Banner */}
      {data.deadlineAt && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs border ${
            data.deadlinePassed
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-blue-50 border-blue-200 text-blue-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Hạn nộp lịch rảnh: <strong>{data.deadlineAt.slice(11, 16)} ngày {formatDateVN(data.deadlineAt.slice(0, 10))}</strong>
            </span>
          </div>
          {data.deadlinePassed && (
            <Badge variant="warning">Đã hết hạn nộp</Badge>
          )}
        </div>
      )}

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 border ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-border rounded-lg p-3 text-xs">
        <span className="text-slate-500 font-medium">Chú thích:</span>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" />
          <span>Rảnh (Có thể đi làm)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amber-500 inline-block" />
          <span>Thích (Ưu tiên ca này)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-400 inline-block" />
          <span>Bận (Không đi làm được)</span>
        </div>
      </div>

      {/* Days & Shift Slots */}
      <div className="space-y-4">
        {data.days.map((day) => (
          <Card key={day.workDate} className="overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-border py-2.5 px-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  {DAY_NAMES[day.dayOfWeek]} — {formatDateVN(day.workDate)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {day.slots.length} khung ca
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-3 divide-y divide-border/60">
              {day.slots.map((slot) => {
                const currentPref =
                  preferences[`${slot.workDate}_${slot.templateId}`] ?? "AVAILABLE";

                return (
                  <div
                    key={slot.templateId}
                    className="py-2.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {slot.templateName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {slot.startTime} – {slot.endTime}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setSlotPref(slot.workDate, slot.templateId, "AVAILABLE")
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                          currentPref === "AVAILABLE"
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                            : "bg-white border-border text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Check className="h-3 w-3" />
                        <span>Rảnh</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSlotPref(slot.workDate, slot.templateId, "PREFERRED")
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                          currentPref === "PREFERRED"
                            ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                            : "bg-white border-border text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Heart className="h-3 w-3" />
                        <span>Thích</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSlotPref(slot.workDate, slot.templateId, "UNAVAILABLE")
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                          currentPref === "UNAVAILABLE"
                            ? "bg-red-600 text-white border-red-600 shadow-sm"
                            : "bg-white border-border text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <XCircle className="h-3 w-3" />
                        <span>Bận</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Save Button Bar */}
      <div className="sticky bottom-4 z-20 flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="shadow-lg h-11 px-6 gap-2"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "Đang lưu..." : "Lưu đăng ký lịch rảnh"}</span>
        </Button>
      </div>
    </div>
  );
}
