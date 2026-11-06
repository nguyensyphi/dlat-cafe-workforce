"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Coffee,
  History,
  LogOut,
  Play,
  QrCode,
  RefreshCw,
  StopCircle,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { formatDateVN, formatTimeVN } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AttendanceDto } from "@/modules/attendance/attendance.types";

interface EmployeeAttendanceProps {
  initialTodayStatus: {
    workDate: string;
    assignedShift: {
      id: string;
      name: string;
      startTime: string;
      endTime: string;
      breakMinutes: number;
    } | null;
    attendance: AttendanceDto | null;
    currentStatus: {
      hasClockedIn: boolean;
      hasClockedOut: boolean;
      isOnBreak: boolean;
      clockInTime: string | null;
      clockOutTime: string | null;
      workedMinutes: number;
      breakMinutes: number;
    };
  } | null;
  history: AttendanceDto[];
}

type EventType = "CLOCK_IN" | "BREAK_START" | "BREAK_END" | "CLOCK_OUT";

export function EmployeeAttendanceClient({
  initialTodayStatus,
  history: initialHistory,
}: EmployeeAttendanceProps) {
  const [tab, setTab] = useState<"SCAN" | "HISTORY">("SCAN");
  const [todayStatus, setTodayStatus] = useState(initialTodayStatus);
  const [history] = useState(initialHistory);

  // Scanner State
  const [selectedEventType, setSelectedEventType] = useState<EventType>(() => {
    if (!initialTodayStatus?.currentStatus.hasClockedIn) return "CLOCK_IN";
    if (initialTodayStatus.currentStatus.isOnBreak) return "BREAK_END";
    if (!initialTodayStatus.currentStatus.hasClockedOut) return "CLOCK_OUT";
    return "CLOCK_IN";
  });

  const [scannerActive, setScannerActive] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "qr-reader-container";

  // Re-fetch today's status
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/my?today=true");
      if (res.ok) {
        const json = await res.json();
        setTodayStatus(json.data);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Submit scan with token
  const handleProcessToken = useCallback(
    async (token: string) => {
      setLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        const res = await fetch("/api/attendance/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: token.trim(),
            eventType: selectedEventType,
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          setErrorMessage(
            json.error?.message ||
              json.message ||
              "Chấm công thất bại. Vui lòng thử lại.",
          );
        } else {
          setSuccessMessage(json.data.message || "Ghi nhận thành công!");
          setManualToken("");
          // Stop scanner after successful scan
          if (scannerRef.current?.isScanning) {
            await scannerRef.current.stop();
            setScannerActive(false);
          }
          await refreshStatus();
        }
      } catch {
        setErrorMessage("Lỗi kết nối máy chủ. Vui lòng thử lại.");
      } finally {
        setLoading(false);
      }
    },
    [selectedEventType, refreshStatus],
  );

  // Stop camera scanner
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      scannerRef.current = null;
    }
    setScannerActive(false);
  }, []);

  // Start camera scanner
  const startScanner = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const html5QrCode = new Html5Qrcode(scannerContainerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        async (decodedText) => {
          await handleProcessToken(decodedText);
        },
        () => {
          // ignore frame decode failures
        },
      );
      setScannerActive(true);
    } catch {
      setErrorMessage(
        "Không thể mở máy ảnh. Vui lòng cấp quyền truy cập camera trên trình duyệt hoặc nhập mã dự phòng bên dưới.",
      );
      setScannerActive(false);
    }
  }, [handleProcessToken]);

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const curStatus = todayStatus?.currentStatus;
  const assignedShift = todayStatus?.assignedShift;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chấm công Cá nhân</h1>
          <p className="text-sm text-muted-foreground">
            Quét mã QR trên màn hình Kiosk tại quầy để ghi nhận giờ vào ca, nghỉ giữa ca và
            tan ca
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => {
            setTab("SCAN");
            stopScanner();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "SCAN"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <QrCode className="h-4 w-4" />
          <span>Quét mã QR</span>
        </button>
        <button
          onClick={() => {
            setTab("HISTORY");
            stopScanner();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "HISTORY"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Lịch sử chấm công</span>
        </button>
      </div>

      {tab === "SCAN" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Today Shift & Current Status Card */}
          <div className="space-y-6 lg:col-span-1">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  Ca làm việc hôm nay
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {assignedShift ? (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-50/50 p-3.5 dark:bg-emerald-950/20">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                        {assignedShift.name}
                      </span>
                      <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                        Đã xếp ca
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {assignedShift.startTime} – {assignedShift.endTime}
                        </span>
                      </div>
                      {assignedShift.breakMinutes > 0 && (
                        <p className="mt-1 text-xs">
                          Nghỉ giữa ca: {assignedShift.breakMinutes} phút
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-muted/30 p-3.5 text-sm text-muted-foreground">
                    Hôm nay bạn không có ca làm việc được phân công trên lịch chính thức.
                  </div>
                )}

                {/* Live Status summary */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Trạng thái hiện tại
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md border border-border p-2.5">
                      <span className="text-xs text-muted-foreground">Giờ vào ca:</span>
                      <p className="font-medium">
                        {curStatus?.clockInTime || "Chưa vào ca"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border p-2.5">
                      <span className="text-xs text-muted-foreground">Giờ tan ca:</span>
                      <p className="font-medium">
                        {curStatus?.clockOutTime || "Chưa tan ca"}
                      </p>
                    </div>
                  </div>

                  {curStatus?.hasClockedIn && !curStatus.hasClockedOut && (
                    <div className="flex items-center justify-between rounded-md border border-border bg-card p-2.5 text-xs">
                      <span>Đã làm việc:</span>
                      <span className="font-semibold text-emerald-600">
                        {Math.floor((curStatus.workedMinutes || 0) / 60)}h{" "}
                        {(curStatus.workedMinutes || 0) % 60}m
                      </span>
                    </div>
                  )}

                  {curStatus?.isOnBreak && (
                    <Badge variant="warning" className="w-full justify-center py-1">
                      Đang trong thời gian nghỉ giữa ca
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Event Selector & Scanner */}
          <div className="space-y-6 lg:col-span-2">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  Chọn hành động & Quét mã QR
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Event Selector Buttons */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setSelectedEventType("CLOCK_IN")}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      selectedEventType === "CLOCK_IN"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <Play className="h-5 w-5 text-emerald-600" />
                    <span className="text-xs font-semibold">1. Vào ca</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedEventType("BREAK_START")}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      selectedEventType === "BREAK_START"
                        ? "border-amber-600 bg-amber-50 text-amber-900 shadow-sm dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <Coffee className="h-5 w-5 text-amber-600" />
                    <span className="text-xs font-semibold">2. Bắt đầu nghỉ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedEventType("BREAK_END")}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      selectedEventType === "BREAK_END"
                        ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm dark:bg-blue-950/40 dark:text-blue-200"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <RefreshCw className="h-5 w-5 text-blue-600" />
                    <span className="text-xs font-semibold">3. Hết giờ nghỉ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedEventType("CLOCK_OUT")}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      selectedEventType === "CLOCK_OUT"
                        ? "border-rose-600 bg-rose-50 text-rose-900 shadow-sm dark:bg-rose-950/40 dark:text-rose-200"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <LogOut className="h-5 w-5 text-rose-600" />
                    <span className="text-xs font-semibold">4. Tan ca</span>
                  </button>
                </div>

                {/* Notifications */}
                {errorMessage && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                )}

                {/* Camera Viewfinder */}
                <div className="flex flex-col items-center justify-center space-y-4">
                  <div
                    id={scannerContainerId}
                    className="aspect-square w-full max-w-sm overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/40"
                  />

                  <div className="flex items-center gap-3">
                    {!scannerActive ? (
                      <Button
                        type="button"
                        onClick={startScanner}
                        disabled={loading}
                        className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <Camera className="h-4 w-4" />
                        <span>Bật Máy ảnh Quét QR</span>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={stopScanner}
                        className="gap-2"
                      >
                        <StopCircle className="h-4 w-4" />
                        <span>Tắt Máy ảnh</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Manual Fallback Input */}
                <div className="border-t border-border pt-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (manualToken) handleProcessToken(manualToken);
                    }}
                    className="flex flex-col gap-2 sm:flex-row sm:items-end"
                  >
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="manual-token" className="text-xs text-muted-foreground">
                        Nhập token thủ công (khi máy ảnh không hoạt động):
                      </Label>
                      <Input
                        id="manual-token"
                        value={manualToken}
                        onChange={(e) => setManualToken(e.target.value)}
                        placeholder="Dán mã token từ Kiosk..."
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={loading || !manualToken.trim()}
                    >
                      {loading ? "Đang xử lý..." : "Xác nhận"}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "HISTORY" && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Bảng chấm công gần đây ({history.length} bản ghi)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Chưa có dữ liệu chấm công.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Ngày làm việc</th>
                      <th className="py-2.5 px-3">Ca làm</th>
                      <th className="py-2.5 px-3">Vào ca</th>
                      <th className="py-2.5 px-3">Tan ca</th>
                      <th className="py-2.5 px-3">Giờ thực tế</th>
                      <th className="py-2.5 px-3">Giờ tính lương</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="py-2.5 px-3 font-medium">
                          {formatDateVN(item.workDate)}
                        </td>
                        <td className="py-2.5 px-3">{item.shiftName}</td>
                        <td className="py-2.5 px-3">
                          {item.clockIn ? formatTimeVN(item.clockIn) : "—"}
                          {item.lateMinutes > 0 && (
                            <span className="ml-1 text-xs text-amber-600">
                              (+{item.lateMinutes}p)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {item.clockOut ? formatTimeVN(item.clockOut) : "—"}
                          {item.earlyLeaveMinutes > 0 && (
                            <span className="ml-1 text-xs text-rose-600">
                              (-{item.earlyLeaveMinutes}p)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium">
                          {item.workedHours.toFixed(2)}h
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-emerald-600">
                          {item.paidHours !== null ? `${item.paidHours.toFixed(2)}h` : "Chờ duyệt"}
                        </td>
                        <td className="py-2.5 px-3">
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
