"use client";

import { useState } from "react";
import { DollarSign, FileText, Lock } from "lucide-react";
import { formatDateVN } from "@/lib/date";
import { formatVnd } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayslipModal, type PayslipData } from "@/components/payroll/payslip-modal";

interface MyPayrollItem {
  id: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string | null;
  employeeCode: string;
  fullName: string;
  positionName: string;
  paidHours: number;
  hourlyRateVND: bigint | number | string;
  basePayVND: bigint | number | string;
  overtimePayVND: bigint | number | string;
  allowancesVND: bigint | number | string;
  bonusesVND: bigint | number | string;
  deductionsVND: bigint | number | string;
  adjustmentsVND: bigint | number | string;
  adjustmentReason?: string | null;
  totalPayVND: bigint | number | string;
  status: string;
}

function toBigIntSafe(value: bigint | number | string | null | undefined): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim() !== "") return BigInt(value.trim());
  return 0n;
}

export function EmployeePayrollClient({
  items,
}: {
  items: MyPayrollItem[];
}) {
  const [payslipModalOpen, setPayslipModalOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(null);

  const totalEarnedVND = items.reduce(
    (acc, cur) => acc + toBigIntSafe(cur.totalPayVND),
    0n,
  );

  const handleOpenPayslip = (slip: MyPayrollItem) => {
    setSelectedPayslip({
      periodName: slip.periodName,
      periodStart: formatDateVN(slip.periodStart),
      periodEnd: formatDateVN(slip.periodEnd),
      paymentDate: slip.paymentDate ? formatDateVN(slip.paymentDate) : null,
      employeeCode: slip.employeeCode,
      fullName: slip.fullName,
      positionName: slip.positionName,
      workedHours: slip.paidHours,
      hourlyRateVND: toBigIntSafe(slip.hourlyRateVND),
      basePayVND: toBigIntSafe(slip.basePayVND),
      overtimePayVND: toBigIntSafe(slip.overtimePayVND),
      allowancesVND: toBigIntSafe(slip.allowancesVND),
      bonusesVND: toBigIntSafe(slip.bonusesVND),
      deductionsVND: toBigIntSafe(slip.deductionsVND),
      adjustmentsVND: toBigIntSafe(slip.adjustmentsVND),
      adjustmentReason: slip.adjustmentReason,
      totalPayVND: toBigIntSafe(slip.totalPayVND),
    });
    setPayslipModalOpen(true);
  };

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
                          {formatVnd(toBigIntSafe(slip.totalPayVND))}
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
                      <span className="font-medium text-foreground">{formatVnd(toBigIntSafe(slip.hourlyRateVND))}/h</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Lương cơ bản:</span>
                      <span className="font-medium text-foreground">{formatVnd(toBigIntSafe(slip.basePayVND))}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Lương tăng ca:</span>
                      <span className="font-medium text-foreground">
                        {toBigIntSafe(slip.overtimePayVND) > 0n ? `+${formatVnd(toBigIntSafe(slip.overtimePayVND))}` : "0 ₫"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Phụ cấp:</span>
                      <span className="font-medium text-emerald-600">
                        {toBigIntSafe(slip.allowancesVND) > 0n ? `+${formatVnd(toBigIntSafe(slip.allowancesVND))}` : "0 ₫"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Thưởng:</span>
                      <span className="font-medium text-emerald-600">
                        {toBigIntSafe(slip.bonusesVND) > 0n ? `+${formatVnd(toBigIntSafe(slip.bonusesVND))}` : "0 ₫"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Khấu trừ:</span>
                      <span className="font-medium text-rose-600">
                        {toBigIntSafe(slip.deductionsVND) > 0n ? `-${formatVnd(toBigIntSafe(slip.deductionsVND))}` : "0 ₫"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Điều chỉnh:</span>
                      <span className="font-medium text-foreground">{formatVnd(toBigIntSafe(slip.adjustmentsVND))}</span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] w-full sm:w-auto gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/5"
                      onClick={() => handleOpenPayslip(slip)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Xem &amp; Tải phiếu lương chi tiết</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payslip Detail & Zalo Image Modal */}
      <PayslipModal
        open={payslipModalOpen}
        onOpenChange={setPayslipModalOpen}
        data={selectedPayslip}
      />
    </div>
  );
}

