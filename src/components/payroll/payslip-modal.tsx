"use client";

import React, { useRef } from "react";
import {
  Printer,
  Download,
  Coffee,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatVnd } from "@/lib/currency";

export interface PayslipData {
  periodName: string;
  periodStart: string;
  periodEnd: string;
  paymentDate?: string | null;
  employeeCode: string;
  fullName: string;
  positionName: string;
  workedHours: number;
  hourlyRateVND: bigint | number | string;
  basePayVND: bigint | number | string;
  overtimePayVND?: bigint | number | string;
  allowancesVND: bigint | number | string;
  bonusesVND: bigint | number | string;
  deductionsVND: bigint | number | string;
  adjustmentsVND?: bigint | number | string;
  adjustmentReason?: string | null;
  totalPayVND: bigint | number | string;
}

interface PayslipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PayslipData | null;
}

export function PayslipModal({ open, onOpenChange, data }: PayslipModalProps) {
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  if (!data) return null;

  const toBigInt = (val?: bigint | number | string) => BigInt(val || 0);

  const hourlyRate = toBigInt(data.hourlyRateVND);
  const basePay = toBigInt(data.basePayVND);
  const allowances = toBigInt(data.allowancesVND);
  const bonuses = toBigInt(data.bonusesVND);
  const deductions = toBigInt(data.deductionsVND);
  const totalPay = toBigInt(data.totalPayVND);

  // Print payslip
  const handlePrint = () => {
    window.print();
  };

  // Generate high-resolution image for Zalo
  const handleDownloadZaloImage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1060;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 1060);
    grad.addColorStop(0, "#064e3b");
    grad.addColorStop(0.18, "#047857");
    grad.addColorStop(0.19, "#ffffff");
    grad.addColorStop(1, "#f8fafc");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 1060);

    // Brand Header
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("☕ D'LAT CAFE & BISTRO", 400, 50);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText("PHIẾU LƯƠNG NHÂN VIÊN", 400, 100);

    ctx.fillStyle = "#d1fae5";
    ctx.font = "500 18px sans-serif";
    ctx.fillText(data.periodName, 400, 140);

    // Employee Info Card Box
    ctx.fillStyle = "#f8fafc";
    ctx.roundRect(50, 215, 700, 120, 16);
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Employee details
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(data.fullName, 80, 260);

    ctx.fillStyle = "#047857";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(`Mã NV: ${data.employeeCode}`, 80, 295);

    ctx.fillStyle = "#475569";
    ctx.font = "500 16px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`Vị trí: ${data.positionName}`, 720, 260);
    ctx.fillText(`Kỳ: ${data.periodStart} – ${data.periodEnd}`, 720, 295);

    // Salary Table Header
    ctx.fillStyle = "#f1f5f9";
    ctx.roundRect(50, 360, 700, 45, 10);
    ctx.fill();

    ctx.fillStyle = "#334155";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("KHOẢN MỤC THU NHẬP", 75, 388);
    ctx.textAlign = "right";
    ctx.fillText("SỐ TIỀN (VNĐ)", 725, 388);

    // Table Rows
    const rows = [
      {
        label: `Lương theo giờ (${data.workedHours}h × ${formatVnd(hourlyRate)}/h)`,
        value: formatVnd(basePay),
        isPositive: true,
      },
      {
        label: "Phụ cấp (Trách nhiệm, ăn ca...)",
        value: formatVnd(allowances),
        isPositive: allowances > 0n,
      },
      {
        label: "Tiền thưởng (Chuyên cần, năng suất)",
        value: formatVnd(bonuses),
        isPositive: bonuses > 0n,
      },
      {
        label: "Tạm ứng / Các khoản giảm trừ",
        value: deductions > 0n ? `- ${formatVnd(deductions)}` : "0 ₫",
        isNegative: deductions > 0n,
      },
    ];

    let rowY = 440;
    rows.forEach((r) => {
      ctx.fillStyle = "#1e293b";
      ctx.font = "500 17px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(r.label, 75, rowY);

      ctx.fillStyle = r.isNegative ? "#dc2626" : "#0f172a";
      ctx.font = "bold 17px monospace";
      ctx.textAlign = "right";
      ctx.fillText(r.value, 725, rowY);

      // dotted separator line
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(75, rowY + 18);
      ctx.lineTo(725, rowY + 18);
      ctx.stroke();

      rowY += 55;
    });

    // Net Pay Highlight Box
    ctx.fillStyle = "#ecfdf5";
    ctx.roundRect(50, rowY + 20, 700, 95, 18);
    ctx.fill();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "#065f46";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("TỔNG THỰC LĨNH CHUYỂN KHOẢN:", 80, rowY + 76);

    ctx.fillStyle = "#047857";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "right";
    ctx.fillText(formatVnd(totalPay), 720, rowY + 80);

    // Footer & Signatures
    const footerY = 820;
    ctx.fillStyle = "#475569";
    ctx.font = "600 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("NGƯỜI LẬP BIỂU", 200, footerY);
    ctx.fillText("XÁC NHẬN CỦA QUẢN LÝ", 600, footerY);

    ctx.font = "italic 13px sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("(Ký & ghi rõ họ tên)", 200, footerY + 25);
    ctx.fillText("(Đã duyệt qua hệ thống D'lat Cafe)", 600, footerY + 25);

    ctx.fillStyle = "#059669";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("✓ ĐÃ PHÊ DUYỆT CHÍNH THỨC", 600, footerY + 75);

    // Final bottom note
    ctx.fillStyle = "#94a3b8";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "Mọi thắc mắc về phiếu lương, vui lòng liên hệ Ban Quản trị trong vòng 48h.",
      400,
      1015,
    );

    // Download PNG
    const link = document.createElement("a");
    link.download = `PhieuLuong-${data.employeeCode}-${data.periodName.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-xl p-0 overflow-hidden rounded-2xl [&>button]:hidden print:m-0 print:p-0 print:border-none print:shadow-none">
        {/* Printable Area */}
        <div ref={printAreaRef} className="p-4 sm:p-6 bg-white space-y-4 sm:space-y-5 overflow-y-auto max-h-[85vh]">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
                <Coffee className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  D&apos;lat Cafe &amp; Bistro
                </h3>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                  Phiếu Lương Nhân Viên
                </h2>
                <p className="text-xs text-slate-500">{data.periodName}</p>
              </div>
            </div>

            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs px-2.5 py-1">
              Chính Thức
            </Badge>
          </div>

          {/* Employee Info Box */}
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">Nhân viên:</span>
              <span className="font-bold text-sm text-slate-900">{data.fullName}</span>
              <span className="ml-1.5 text-xs text-slate-500 font-mono">({data.employeeCode})</span>
            </div>
            <div>
              <span className="text-slate-500 block">Vị trí:</span>
              <span className="font-semibold text-slate-800">{data.positionName}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Kỳ làm việc:</span>
              <span className="font-medium text-slate-700">
                {data.periodStart} – {data.periodEnd}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Mức lương giờ:</span>
              <span className="font-bold text-emerald-700 font-mono">
                {formatVnd(hourlyRate)}/h
              </span>
            </div>
          </div>

          {/* Income Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 text-xs">
            <div className="flex items-center justify-between bg-slate-100/70 p-3 font-semibold text-slate-700">
              <span>Khoản mục</span>
              <span>Số tiền</span>
            </div>

            <div className="flex items-center justify-between p-3 hover:bg-slate-50">
              <div>
                <span className="font-medium text-slate-800 block">Tiền lương theo giờ công</span>
                <span className="text-[11px] text-slate-400">
                  {data.workedHours} giờ làm việc × {formatVnd(hourlyRate)}/h
                </span>
              </div>
              <span className="font-mono font-semibold text-slate-900">
                {formatVnd(basePay)}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 hover:bg-slate-50">
              <span className="font-medium text-slate-800">Phụ cấp (Trách nhiệm, ăn ca...)</span>
              <span className="font-mono font-semibold text-slate-900">
                {allowances > 0n ? `+ ${formatVnd(allowances)}` : "0 ₫"}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 hover:bg-slate-50">
              <span className="font-medium text-slate-800">Tiền thưởng (Chuyên cần, năng suất)</span>
              <span className="font-mono font-semibold text-slate-900">
                {bonuses > 0n ? `+ ${formatVnd(bonuses)}` : "0 ₫"}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 hover:bg-slate-50">
              <span className="font-medium text-slate-800">Tạm ứng / Giảm trừ</span>
              <span className="font-mono font-semibold text-rose-600">
                {deductions > 0n ? `- ${formatVnd(deductions)}` : "0 ₫"}
              </span>
            </div>

            {/* Total Net Pay */}
            <div className="flex items-center justify-between bg-emerald-50 p-3.5 border-t-2 border-emerald-500">
              <div>
                <span className="font-bold text-sm text-emerald-900 block">
                  TỔNG THỰC LĨNH CHUYỂN KHOẢN
                </span>
                <span className="text-[11px] text-emerald-700">Đã bao gồm phụ cấp và giảm trừ</span>
              </div>
              <span className="font-mono text-lg font-bold text-emerald-800">
                {formatVnd(totalPay)}
              </span>
            </div>
          </div>

          {/* Action buttons (hidden when printing) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 print:hidden border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="min-h-[44px] h-11 w-full sm:w-auto gap-1.5 text-xs text-slate-700 border-slate-300 hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>In phiếu lương</span>
            </Button>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleDownloadZaloImage}
                className="min-h-[44px] h-11 w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white font-semibold gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Tải ảnh gửi Zalo</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="min-h-[44px] h-11 w-full sm:w-auto text-xs text-slate-500 hover:text-slate-900"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

