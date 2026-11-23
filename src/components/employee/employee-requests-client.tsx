"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  FileText,
  Plus,
} from "lucide-react";
import { formatDateTimeVN, formatDateVN } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LeaveRequestDto } from "@/modules/leaves/leave.types";
import type { SwapRequestDto } from "@/modules/swaps/swap.types";

interface MyShiftOption {
  assignmentId: string;
  shiftId: string;
  shiftName: string;
  workDate: string;
  startTime: string;
  endTime: string;
}

export function EmployeeRequestsClient({
  leaves: initialLeaves,
  swaps: initialSwaps,
  myShifts,
  colleagues,
  currentEmployeeId,
}: {
  leaves: LeaveRequestDto[];
  swaps: SwapRequestDto[];
  myShifts: MyShiftOption[];
  colleagues: Array<{ id: string; fullName: string; primaryPositionName: string }>;
  currentEmployeeId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"LEAVES" | "SWAPS">("LEAVES");
  const [leaves, setLeaves] = useState(initialLeaves);
  const [swaps, setSwaps] = useState(initialSwaps);

  // Leave Form Modal
  const [createLeaveOpen, setCreateLeaveOpen] = useState(false);
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);

  // Swap Form Modal
  const [createSwapOpen, setCreateSwapOpen] = useState(false);
  const [swapShiftId, setSwapShiftId] = useState(myShifts[0]?.shiftId || "");
  const [swapTargetId, setSwapTargetId] = useState(colleagues[0]?.id || "");
  const [swapReason, setSwapReason] = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmitLeave(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt: new Date(leaveStart).toISOString(),
          endAt: new Date(leaveEnd).toISOString(),
          reason: leaveReason,
          isEmergency,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMessage(json.error?.message || "Không thể nộp đơn xin nghỉ");
        return;
      }
      setLeaves([json.data, ...leaves]);
      setCreateLeaveOpen(false);
      setLeaveReason("");
      setIsEmergency(false);
      router.refresh();
    } catch {
      setErrorMessage("Lỗi kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitSwap(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: swapShiftId,
          targetEmployeeId: swapTargetId,
          reason: swapReason,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMessage(json.error?.message || "Không thể gửi yêu cầu đổi ca");
        return;
      }
      setSwaps([json.data, ...swaps]);
      setCreateSwapOpen(false);
      setSwapReason("");
      router.refresh();
    } catch {
      setErrorMessage("Lỗi kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRespondSwap(swapId: string, accept: boolean) {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/swaps/${swapId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const json = await res.json();
      if (json.ok) {
        setSwaps((prev) =>
          prev.map((s) => (s.id === swapId ? json.data : s)),
        );
        router.refresh();
      } else {
        setErrorMessage(json.error?.message || "Không thể phản hồi yêu cầu đổi ca");
      }
    } catch {
      setErrorMessage("Lỗi kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.");
    } finally {
      setActionLoading(false);
    }
  }

  const incomingSwaps = swaps.filter(
    (s) => s.targetEmployeeId === currentEmployeeId && s.status === "PENDING",
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Đơn từ &amp; Đổi ca
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quản lý đơn xin nghỉ phép và yêu cầu đổi ca làm việc
          </p>
        </div>

        {tab === "LEAVES" ? (
          <Button
            type="button"
            size="sm"
            className="min-h-[44px] px-4"
            onClick={() => {
              setErrorMessage(null);
              setCreateLeaveOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Tạo đơn xin nghỉ</span>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="min-h-[44px] px-4"
            onClick={() => {
              setErrorMessage(null);
              setCreateSwapOpen(true);
            }}
            disabled={myShifts.length === 0}
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span>Yêu cầu đổi ca</span>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setTab("LEAVES");
          }}
          className={`min-h-[44px] px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
            tab === "LEAVES"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Đơn xin nghỉ</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setTab("SWAPS");
          }}
          className={`min-h-[44px] px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
            tab === "SWAPS"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <ArrowRightLeft className="h-4 w-4" />
          <span>Đổi ca</span>
          {incomingSwaps.length > 0 && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">
              {incomingSwaps.length} mới
            </Badge>
          )}
        </button>
      </div>

      {/* TAB 1: LEAVES */}
      {tab === "LEAVES" && (
        <div className="space-y-3">
          {leaves.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-xs text-muted-foreground">
                Bạn chưa có đơn xin nghỉ phép nào
              </p>
            </Card>
          ) : (
            leaves.map((leave) => (
              <Card key={leave.id}>
                <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between border-b border-border bg-slate-50">
                  <span className="text-xs font-semibold text-slate-800">
                    Nghỉ: {formatDateTimeVN(leave.startAt)} ➔ {formatDateTimeVN(leave.endAt)}
                  </span>
                  <Badge
                    variant={
                      leave.status === "APPROVED"
                        ? "default"
                        : leave.status === "REJECTED"
                        ? "destructive"
                        : "warning"
                    }
                  >
                    {leave.status === "APPROVED"
                      ? "Đã duyệt"
                      : leave.status === "REJECTED"
                      ? "Từ chối"
                      : "Chờ duyệt"}
                  </Badge>
                </CardHeader>
                <CardContent className="p-3 text-xs space-y-2">
                  <p className="text-slate-700">Lý do: &ldquo;{leave.reason}&rdquo;</p>
                  {leave.reviewedAt && (
                    <p className="text-[11px] text-slate-500 pt-1 border-t border-border">
                      Phản hồi từ {leave.reviewedByName}: {leave.reviewNote || "Đã duyệt"}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* TAB 2: SWAPS */}
      {tab === "SWAPS" && (
        <div className="space-y-4">
          {/* Incoming Swaps Alert */}
          {incomingSwaps.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-900">
                Lời mời đổi ca gửi đến bạn:
              </p>
              {incomingSwaps.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {s.requesterName} muốn chuyển {s.shiftName} cho bạn
                    </p>
                    <p className="text-slate-600 mt-0.5">
                      Thời gian: {formatDateVN(s.workDate)} ({s.startTime}–{s.endTime})
                    </p>
                    {s.reason && (
                      <p className="text-muted-foreground italic mt-0.5">
                        Lý do: &ldquo;{s.reason}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRespondSwap(s.id, false)}
                      disabled={actionLoading}
                    >
                      Từ chối
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleRespondSwap(s.id, true)}
                      disabled={actionLoading}
                    >
                      Đồng ý nhận ca
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All Swaps History */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-700">
              Lịch sử các yêu cầu đổi ca của bạn:
            </p>
            {swaps.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <p className="text-xs text-muted-foreground">
                  Chưa có yêu cầu đổi ca nào
                </p>
              </Card>
            ) : (
              swaps.map((s) => (
                <Card key={s.id}>
                  <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between border-b border-border bg-slate-50">
                    <span className="text-xs font-semibold text-slate-800">
                      {s.shiftName} ({formatDateVN(s.workDate)}: {s.startTime}–{s.endTime})
                    </span>
                    <Badge
                      variant={
                        s.status === "APPROVED"
                          ? "default"
                          : s.status === "REJECTED"
                          ? "destructive"
                          : s.status === "ACCEPTED"
                          ? "warning"
                          : "secondary"
                      }
                    >
                      {s.status === "APPROVED"
                        ? "Đã duyệt"
                        : s.status === "REJECTED"
                        ? "Từ chối"
                        : s.status === "ACCEPTED"
                        ? "Chờ Quản lý duyệt"
                        : "Chờ bạn nhận trả lời"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-3 text-xs space-y-1">
                    <p className="text-slate-700">
                      Từ: <strong>{s.requesterName}</strong> ➔ Đến: <strong>{s.targetEmployeeName}</strong>
                    </p>
                    {s.reason && (
                      <p className="text-muted-foreground italic">
                        Lý do: &ldquo;{s.reason}&rdquo;
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Create Leave Form */}
      <Dialog open={createLeaveOpen} onOpenChange={setCreateLeaveOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Tạo đơn xin nghỉ phép</DialogTitle>
            <DialogDescription>
              Gửi đơn xin nghỉ phép đến Quản lý phê duyệt
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitLeave} className="space-y-3 py-2">
            {errorMessage && (
              <div
                role="alert"
                className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"
              >
                {errorMessage}
              </div>
            )}

            <div className="space-y-1">
              <Label>Bắt đầu nghỉ lúc</Label>
              <Input
                type="datetime-local"
                value={leaveStart}
                onChange={(e) => setLeaveStart(e.target.value)}
                className="min-h-[44px]"
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Kết thúc nghỉ lúc</Label>
              <Input
                type="datetime-local"
                value={leaveEnd}
                onChange={(e) => setLeaveEnd(e.target.value)}
                className="min-h-[44px]"
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Lý do xin nghỉ</Label>
              <Input
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="VD: Bận việc gia đình, đi khám bệnh..."
                className="min-h-[44px]"
                required
              />
            </div>

            <label
              htmlFor="is-emergency-leave"
              className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 cursor-pointer min-h-[44px]"
            >
              <input
                id="is-emergency-leave"
                type="checkbox"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 shrink-0"
              />
              <span className="leading-snug font-medium">
                Nghỉ đột xuất / Khẩn cấp (&lt; 4 tiếng trước ca)
              </span>
            </label>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setCreateLeaveOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" className="min-h-[44px]" disabled={actionLoading}>
                Gửi đơn xin nghỉ
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Create Swap Form */}
      <Dialog open={createSwapOpen} onOpenChange={setCreateSwapOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Tạo yêu cầu đổi ca làm việc</DialogTitle>
            <DialogDescription>
              Đổi ca với đồng nghiệp và gửi Quản lý phê duyệt
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitSwap} className="space-y-3 py-2">
            {errorMessage && (
              <div
                role="alert"
                className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"
              >
                {errorMessage}
              </div>
            )}

            <div className="space-y-1">
              <Label>Chọn ca làm của bạn cần đổi</Label>
              <select
                className="w-full min-h-[44px] rounded-md border border-input bg-card px-3 py-2 text-sm"
                value={swapShiftId}
                onChange={(e) => setSwapShiftId(e.target.value)}
                required
              >
                {myShifts.map((s) => (
                  <option key={s.shiftId} value={s.shiftId}>
                    {s.shiftName} ({formatDateVN(s.workDate)}: {s.startTime}–{s.endTime})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>Chọn đồng nghiệp nhận ca</Label>
              <select
                className="w-full min-h-[44px] rounded-md border border-input bg-card px-3 py-2 text-sm"
                value={swapTargetId}
                onChange={(e) => setSwapTargetId(e.target.value)}
                required
              >
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.primaryPositionName})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>Lý do đổi ca</Label>
              <Input
                value={swapReason}
                onChange={(e) => setSwapReason(e.target.value)}
                placeholder="VD: Bận đột xuất, đã thỏa thuận trước..."
                className="min-h-[44px]"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setCreateSwapOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" className="min-h-[44px]" disabled={actionLoading}>
                Gửi lời mời đổi ca
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
