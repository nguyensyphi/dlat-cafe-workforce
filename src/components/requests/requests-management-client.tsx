"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  CheckCircle2,
  FileText,
  XCircle,
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

export function RequestsManagementClient({
  leaves: initialLeaves,
  swaps: initialSwaps,
}: {
  leaves: LeaveRequestDto[];
  swaps: SwapRequestDto[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"LEAVES" | "SWAPS">("LEAVES");
  const [leaves, setLeaves] = useState(initialLeaves);
  const [swaps, setSwaps] = useState(initialSwaps);

  const [reviewLeaveOpen, setReviewLeaveOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequestDto | null>(null);
  const [leaveDecision, setLeaveDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [leaveNote, setLeaveNote] = useState("");

  const [reviewSwapOpen, setReviewSwapOpen] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<SwapRequestDto | null>(null);
  const [swapDecision, setSwapDecision] = useState<boolean>(true);
  const [swapNote, setSwapNote] = useState("");

  const [actionLoading, setActionLoading] = useState(false);

  function openReviewLeave(leave: LeaveRequestDto, decision: "APPROVED" | "REJECTED") {
    setSelectedLeave(leave);
    setLeaveDecision(decision);
    setLeaveNote(decision === "APPROVED" ? "Đồng ý" : "Không sắp xếp được người thay thế");
    setReviewLeaveOpen(true);
  }

  function openReviewSwap(swap: SwapRequestDto, approved: boolean) {
    setSelectedSwap(swap);
    setSwapDecision(approved);
    setSwapNote(approved ? "Đồng ý đổi ca" : "Không phù hợp lịch quán");
    setReviewSwapOpen(true);
  }

  async function handleConfirmReviewLeave() {
    if (!selectedLeave) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/leaves/${selectedLeave.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: leaveDecision,
          reviewNote: leaveNote,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setLeaves((prev) =>
          prev.map((l) => (l.id === selectedLeave.id ? json.data.leave : l)),
        );
        setReviewLeaveOpen(false);
        router.refresh();
      } else {
        alert(json.error?.message || "Không thể duyệt đơn");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmReviewSwap() {
    if (!selectedSwap) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/swaps/${selectedSwap.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: swapDecision,
          reviewNote: swapNote,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSwaps((prev) =>
          prev.map((s) => (s.id === selectedSwap.id ? json.data : s)),
        );
        setReviewSwapOpen(false);
        router.refresh();
      } else {
        alert(json.error?.message || "Không thể duyệt đổi ca");
      }
    } finally {
      setActionLoading(false);
    }
  }

  const pendingLeaves = leaves.filter((l) => l.status === "PENDING");
  const pendingSwaps = swaps.filter((s) => s.status === "ACCEPTED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Xét duyệt Yêu cầu &amp; Đổi ca
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Quản lý đơn xin nghỉ phép và phê duyệt đổi ca làm việc giữa các nhân viên
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("LEAVES")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
            tab === "LEAVES"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Đơn xin nghỉ phép</span>
          {pendingLeaves.length > 0 && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              {pendingLeaves.length}
            </Badge>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab("SWAPS")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
            tab === "SWAPS"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <ArrowRightLeft className="h-4 w-4" />
          <span>Yêu cầu đổi ca</span>
          {pendingSwaps.length > 0 && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">
              {pendingSwaps.length}
            </Badge>
          )}
        </button>
      </div>

      {/* TAB 1: LEAVES */}
      {tab === "LEAVES" && (
        <div className="space-y-4">
          {leaves.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-sm text-muted-foreground">
                Chưa có đơn xin nghỉ phép nào
              </p>
            </Card>
          ) : (
            leaves.map((leave) => {
              const isPending = leave.status === "PENDING";
              return (
                <Card
                  key={leave.id}
                  className={isPending ? "border-amber-300 bg-amber-50/20" : ""}
                >
                  <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b border-border bg-slate-50/60">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">
                        {leave.employeeName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({leave.employeeCode})
                      </span>
                    </div>

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

                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Thời gian nghỉ:</span>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {formatDateTimeVN(leave.startAt)} ➔ {formatDateTimeVN(leave.endAt)}
                        </p>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Lý do xin nghỉ:</span>
                        <p className="font-medium text-slate-800 mt-0.5">
                          &ldquo;{leave.reason}&rdquo;
                        </p>
                      </div>
                    </div>

                    {leave.reviewedAt && (
                      <div className="text-xs text-slate-500 pt-2 border-t border-border/60">
                        Duyệt bởi: <strong>{leave.reviewedByName}</strong> lúc{" "}
                        {formatDateTimeVN(leave.reviewedAt)}
                        {leave.reviewNote && (
                          <span className="italic ml-1">
                            — Ghi chú: &ldquo;{leave.reviewNote}&rdquo;
                          </span>
                        )}
                      </div>
                    )}

                    {isPending && (
                      <div className="flex justify-end gap-2 pt-2 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openReviewLeave(leave, "REJECTED")}
                        >
                          <XCircle className="h-3.5 w-3.5 text-red-600" />
                          <span>Từ chối</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openReviewLeave(leave, "APPROVED")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Phê duyệt nghỉ</span>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: SWAPS */}
      {tab === "SWAPS" && (
        <div className="space-y-4">
          {swaps.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-sm text-muted-foreground">
                Chưa có yêu cầu đổi ca nào
              </p>
            </Card>
          ) : (
            swaps.map((swap) => {
              const canManagerReview = swap.status === "ACCEPTED";
              return (
                <Card
                  key={swap.id}
                  className={canManagerReview ? "border-amber-300 bg-amber-50/20" : ""}
                >
                  <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b border-border bg-slate-50/60">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">
                        {swap.requesterName}
                      </span>
                      <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-semibold text-slate-900 text-sm">
                        {swap.targetEmployeeName}
                      </span>
                    </div>

                    <Badge
                      variant={
                        swap.status === "APPROVED"
                          ? "default"
                          : swap.status === "REJECTED"
                          ? "destructive"
                          : swap.status === "ACCEPTED"
                          ? "warning"
                          : "secondary"
                      }
                    >
                      {swap.status === "APPROVED"
                        ? "Đã duyệt"
                        : swap.status === "REJECTED"
                        ? "Từ chối"
                        : swap.status === "ACCEPTED"
                        ? "Chờ Quản lý duyệt"
                        : "Chờ bạn nhận ca trả lời"}
                    </Badge>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Ca làm việc:</span>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {swap.shiftName} ({formatDateVN(swap.workDate)}: {swap.startTime}–{swap.endTime})
                        </p>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Lý do đổi ca:</span>
                        <p className="font-medium text-slate-800 mt-0.5">
                          {swap.reason ? `“${swap.reason}”` : "Không có ghi chú"}
                        </p>
                      </div>
                    </div>

                    {swap.reviewedAt && (
                      <div className="text-xs text-slate-500 pt-2 border-t border-border/60">
                        Duyệt bởi: <strong>{swap.reviewedByName}</strong> lúc{" "}
                        {formatDateTimeVN(swap.reviewedAt)}
                        {swap.reviewNote && (
                          <span className="italic ml-1">
                            — Ghi chú: &ldquo;{swap.reviewNote}&rdquo;
                          </span>
                        )}
                      </div>
                    )}

                    {canManagerReview && (
                      <div className="flex justify-end gap-2 pt-2 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openReviewSwap(swap, false)}
                        >
                          <XCircle className="h-3.5 w-3.5 text-red-600" />
                          <span>Từ chối</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openReviewSwap(swap, true)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Phê duyệt đổi ca</span>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Modal Review Leave */}
      <Dialog open={reviewLeaveOpen} onOpenChange={setReviewLeaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {leaveDecision === "APPROVED" ? "Phê duyệt đơn nghỉ" : "Từ chối đơn nghỉ"}
            </DialogTitle>
            <DialogDescription>
              Nhân viên: {selectedLeave?.employeeName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Ghi chú phản hồi cho nhân viên</Label>
              <Input
                value={leaveNote}
                onChange={(e) => setLeaveNote(e.target.value)}
                placeholder="Nhập ghi chú phản hồi..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewLeaveOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant={leaveDecision === "APPROVED" ? "default" : "destructive"}
              onClick={handleConfirmReviewLeave}
              disabled={actionLoading}
            >
              Xác nhận
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Review Swap */}
      <Dialog open={reviewSwapOpen} onOpenChange={setReviewSwapOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {swapDecision ? "Phê duyệt đổi ca" : "Từ chối đổi ca"}
            </DialogTitle>
            <DialogDescription>
              Chuyển ca {selectedSwap?.shiftName} sang cho {selectedSwap?.targetEmployeeName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Ghi chú của Quản lý</Label>
              <Input
                value={swapNote}
                onChange={(e) => setSwapNote(e.target.value)}
                placeholder="Ghi chú phản hồi..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewSwapOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant={swapDecision ? "default" : "destructive"}
              onClick={handleConfirmReviewSwap}
              disabled={actionLoading}
            >
              Xác nhận
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
