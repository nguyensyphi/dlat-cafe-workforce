"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  UserX,
  Wrench,
} from "lucide-react";
import type {
  ActiveAttendanceAlertsDto,
  MissingClockOutAlertDto,
} from "@/modules/attendance/attendance-monitor.service";
import { formatDateVN, formatTimeVN } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AttendanceAlertsPanel({
  initialAlerts,
  showEmptyState = false,
  onFixed,
}: {
  initialAlerts: ActiveAttendanceAlertsDto;
  showEmptyState?: boolean;
  onFixed?: () => void;
}) {
  const router = useRouter();
  const [missingClockOuts, setMissingClockOuts] = useState(
    initialAlerts.missingClockOuts,
  );
  const [lateOrNoShows, setLateOrNoShows] = useState(
    initialAlerts.lateOrNoShows,
  );
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setMissingClockOuts(initialAlerts.missingClockOuts);
    setLateOrNoShows(initialAlerts.lateOrNoShows);
  }, [initialAlerts]);

  const totalAlerts = missingClockOuts.length + lateOrNoShows.length;

  if (totalAlerts === 0 && !showEmptyState && !feedback && !errorMsg) {
    return null;
  }

  async function handleOneTapFix(item: MissingClockOutAlertDto) {
    setFixingId(item.attendanceId);
    setErrorMsg(null);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/attendance/${item.attendanceId}/quick-fix-clock-out`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clockOut: item.suggestedClockOut,
            reason: `Chủ quán sửa giờ ra 1 chạm theo giờ kết thúc ca (${formatTimeVN(item.suggestedClockOut)})`,
            autoApprove: true,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(json?.error?.message ?? "Không thể sửa giờ ra ca");
        return;
      }

      setMissingClockOuts((prev) =>
        prev.filter((x) => x.attendanceId !== item.attendanceId),
      );
      setFeedback(
        `Đã cập nhật giờ ra ${formatTimeVN(item.suggestedClockOut)} & duyệt công cho ${item.employeeName}.`,
      );
      onFixed?.();
      router.refresh();
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ khi sửa giờ ra");
    } finally {
      setFixingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{feedback}</span>
        </div>
      )}

      {totalAlerts === 0 && showEmptyState && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Không có cảnh báo đi trễ/vắng mặt (+15p) hay quên chấm công ra (+60p).
          </span>
        </div>
      )}

      {totalAlerts > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Missing Clock-Out (+60m) with One-Tap Fix */}
        {missingClockOuts.length > 0 && (
          <Card className="border-amber-300 bg-amber-50/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base text-amber-950">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span>Quên chấm công ra (+60p)</span>
                </CardTitle>
                <Badge variant="destructive">
                  {missingClockOuts.length} ca cần xử lý
                </Badge>
              </div>
              <CardDescription>
                Nhân viên đã vào ca nhưng quá 60 phút sau tan ca chưa chấm công
                ra. Bấm 1 chạm để chốt đúng giờ kết thúc ca.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {missingClockOuts.map((item) => (
                <div
                  key={item.attendanceId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {item.employeeName}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({item.employeeCode})
                      </span>
                    </p>
                    <p className="text-xs text-slate-600">
                      {item.shiftName} • {formatDateVN(item.workDate)} (Vào:{" "}
                      <strong>{formatTimeVN(item.clockIn)}</strong>)
                    </p>
                    <p className="text-[11px] text-amber-700">
                      Quá giờ kết thúc ca {item.minutesOverdue} phút (gợi ý giờ
                      ra: <strong>{formatTimeVN(item.suggestedClockOut)}</strong>)
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      disabled={fixingId === item.attendanceId}
                      onClick={() => handleOneTapFix(item)}
                      className="min-h-[44px] w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>
                        {fixingId === item.attendanceId
                          ? "Đang sửa..."
                          : `Sửa giờ ra ${formatTimeVN(item.suggestedClockOut)}`}
                      </span>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Late / No-Show (+15m) */}
        {lateOrNoShows.length > 0 && (
          <Card className="border-red-300 bg-red-50/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base text-red-950">
                  <UserX className="h-4 w-4 text-red-600" />
                  <span>Đi trễ / Vắng mặt không phép (+15p)</span>
                </CardTitle>
                <Badge variant="destructive">
                  {lateOrNoShows.length} cảnh báo
                </Badge>
              </div>
              <CardDescription>
                Nhân viên được phân ca đã quá 15 phút chưa chấm công vào ca và
                không có đơn nghỉ phép được duyệt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {lateOrNoShows.map((item) => (
                <div
                  key={item.assignmentId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-200 bg-white p-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.employeeName}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({item.employeeCode})
                        </span>
                      </p>
                      <Badge
                        variant="destructive"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {item.severity === "NO_SHOW"
                          ? "Vắng không phép"
                          : `Trễ ${item.minutesLate}p`}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600">
                      {item.shiftName} ({formatTimeVN(item.shiftStartAt)}–
                      {formatTimeVN(item.shiftEndAt)}) • {item.positionName}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={`tel:${item.employeePhone}`}
                      className="inline-flex min-h-[44px] flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span>Gọi {item.employeePhone}</span>
                    </a>
                    <Link
                      href="/schedules"
                      className="inline-flex min-h-[44px] flex-1 sm:flex-none items-center justify-center gap-1 rounded-lg border border-border bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      <span>Đổi ca</span>
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        </div>
      )}
    </div>
  );
}
