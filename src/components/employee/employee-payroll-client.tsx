"use client";

import { DollarSign, FileText, Lock } from "lucide-react";
import { formatDateVN } from "@/lib/date";
import { formatVnd } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MyPayrollItem {
  id: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string | null;
  paidHours: number;
  hourlyRateVND: bigint;
  basePayVND: bigint;
  overtimePayVND: bigint;
  allowancesVND: bigint;
  bonusesVND: bigint;
  deductionsVND: bigint;
  adjustmentsVND: bigint;
  totalPayVND: bigint;
  status: string;
}

export function EmployeePayrollClient({
  items,
}: {
  items: MyPayrollItem[];
}) {
  const totalEarnedVND = items.reduce((acc, cur) => acc + cur.totalPayVND, 0n);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Phiếu lương của Tôi</h1>
        <p className="text-sm text-muted-foreground">
          Lịch sử chi trả tiền lương minh bạch theo từng kỳ làm việc đã được phê duyệt
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tổng thu nhập đã nhận
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatVnd(totalEarnedVND)}
            </div>
            <p className="text-xs text-muted-foreground">
              Từ {items.length} kỳ lương đã phê duyệt/thanh toán
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Số phiếu lương
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length} phiếu</div>
            <p className="text-xs text-muted-foreground">Kỳ lương chính thức</p>
          </CardContent>
        </Card>
      </div>

      {/* Payslips List */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Danh sách Phiếu lương ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Bạn chưa có phiếu lương nào được phê duyệt. Khi Quản lý/Chủ quán duyệt kỳ lương chính thức, phiếu lương sẽ xuất hiện tại đây.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((slip) => (
                <div
                  key={slip.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-2.5">
                    <div>
                      <h3 className="font-semibold text-foreground text-base">
                        {slip.periodName}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Thời gian: {formatDateVN(slip.periodStart)} – {formatDateVN(slip.periodEnd)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          slip.status === "PAID"
                            ? "border-blue-500 text-blue-600"
                            : slip.status === "LOCKED"
                              ? "bg-gray-800 text-white"
                              : "border-emerald-500 text-emerald-600"
                        }
                      >
                        {slip.status === "LOCKED" && <Lock className="mr-1 h-3 w-3 inline" />}
                        {slip.status === "PAID"
                          ? "Đã thanh toán"
                          : slip.status === "LOCKED"
                            ? "Đã khóa sổ"
                            : "Đã phê duyệt"}
                      </Badge>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground block">Thực lĩnh:</span>
                        <span className="text-lg font-bold text-emerald-600">
                          {formatVnd(slip.totalPayVND)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Detail Breakdown */}
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 bg-muted/30 rounded-lg p-3">
                    <div>
                      <span className="text-muted-foreground block">Giờ tính lương:</span>
                      <span className="font-medium text-foreground">{slip.paidHours.toFixed(2)}h</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Đơn giá giờ:</span>
                      <span className="font-medium text-foreground">{formatVnd(slip.hourlyRateVND)}/h</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Lương cơ bản:</span>
                      <span className="font-medium text-foreground">{formatVnd(slip.basePayVND)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Lương tăng ca:</span>
                      <span className="font-medium text-foreground">
                        {slip.overtimePayVND > 0n ? `+${formatVnd(slip.overtimePayVND)}` : "0 ₫"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Phụ cấp:</span>
                      <span className="font-medium text-emerald-600">
                        {slip.allowancesVND > 0n ? `+${formatVnd(slip.allowancesVND)}` : "0 ₫"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Thưởng:</span>
                      <span className="font-medium text-emerald-600">
                        {slip.bonusesVND > 0n ? `+${formatVnd(slip.bonusesVND)}` : "0 ₫"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Khấu trừ:</span>
                      <span className="font-medium text-rose-600">
                        {slip.deductionsVND > 0n ? `-${formatVnd(slip.deductionsVND)}` : "0 ₫"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Điều chỉnh:</span>
                      <span className="font-medium text-foreground">{formatVnd(slip.adjustmentsVND)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

