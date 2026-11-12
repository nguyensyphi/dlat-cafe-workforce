"use client";

import React, { useState, useRef } from "react";
import {
  FileSpreadsheet,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  RefreshCw,
  Users,
  Clock,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatVnd } from "@/lib/currency";

interface ExcelImportModalProps {
  periodId: string;
  periodName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface PreviewRow {
  employeeId?: string;
  employeeCode: string;
  fullName: string;
  positionName: string;
  workedHours: number;
  hourlyRateVND: string | number | bigint;
  basePayVND: string | number | bigint;
  allowancesVND: string | number | bigint;
  bonusesVND: string | number | bigint;
  deductionsVND: string | number | bigint;
  totalPayVND: string | number | bigint;
  notes?: string;
  status: "VALID" | "NOT_FOUND" | "INVALID_HOURS";
  message?: string;
}

interface PreviewResult {
  periodId: string;
  periodName: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  totalHours: number;
  totalPayrollVND: string | number | bigint;
  rows: PreviewRow[];
}

export function ExcelImportModal({
  periodId,
  periodName,
  open,
  onOpenChange,
  onSuccess,
}: ExcelImportModalProps) {
  const [step, setStep] = useState<"UPLOAD" | "PREVIEW">("UPLOAD");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset modal state
  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("UPLOAD");
      setFile(null);
      setPreview(null);
      setError(null);
    }, 200);
  };

  // Download template with active employees
  const handleDownloadTemplate = () => {
    window.location.href = `/api/payroll/periods/${periodId}/template`;
  };

  // File selected -> upload and preview
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`/api/payroll/periods/${periodId}/import-excel`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "Không thể đọc dữ liệu file Excel");
      }

      setPreview(json.data);
      setStep("PREVIEW");
    } catch (err: any) {
      setError(err.message || "Lỗi khi xử lý file Excel");
    } finally {
      setLoading(false);
    }
  };

  // Confirm and apply import
  const handleConfirmImport = async () => {
    if (!preview || preview.validCount === 0) return;

    setApplying(true);
    setError(null);

    try {
      const res = await fetch(`/api/payroll/periods/${periodId}/import-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "Không thể lưu dữ liệu bảng lương");
      }

      handleClose();
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Lỗi khi áp dụng dữ liệu");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl sm:max-w-3xl p-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
                <FileSpreadsheet className="h-6 w-6 text-emerald-200" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white">
                  Nhập Giờ Làm Từ File Excel
                </DialogTitle>
                <DialogDescription className="text-xs text-emerald-100 mt-0.5">
                  Áp dụng số giờ công thực tế từ phần mềm vào ca / bàn giao ca cho {periodName}
                </DialogDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-white border-white/30"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Tải file mẫu Excel</span>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {step === "UPLOAD" ? (
            /* STEP 1: UPLOAD AREA */
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-8 text-center cursor-pointer hover:bg-emerald-50 hover:border-emerald-500 transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <RefreshCw className="h-10 w-10 animate-spin text-emerald-600" />
                    <p className="text-sm font-semibold text-emerald-800">
                      Đang đọc và kiểm tra dữ liệu file Excel...
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 mb-3">
                      <UploadCloud className="h-7 w-7" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Bấm để chọn file Excel bảng giờ công (.xlsx)
                    </h4>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm">
                      Kéo thả hoặc bấm để tải lên file xuất từ phần mềm vào ca, chấm công hoặc bàn giao ca của quán.
                    </p>
                  </>
                )}
              </div>

              {/* Instructions */}
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs text-slate-600 space-y-2">
                <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <span>💡</span> Hướng dẫn nhập file Excel chuẩn cho D'lat Cafe:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-600">
                  <li>
                    Bạn có thể bấm <strong>"Tải file mẫu Excel"</strong> ở góc trên bên phải để có sẵn danh sách Mã NV và Tên nhân viên quán.
                  </li>
                  <li>
                    Cột <strong>"Số giờ làm việc"</strong>: Nhập số giờ công thực tế (Ví dụ: <code>140.5</code> hoặc <code>120</code>).
                  </li>
                  <li>
                    Hệ thống sẽ <strong>tự động lấy đơn giá lương theo giờ (PayRate)</strong> có hiệu lực của từng bạn để tính thành tiền, bạn không cần phải tính thủ công.
                  </li>
                  <li>
                    Các cột Phụ cấp, Thưởng, Tạm ứng/Khấu trừ có thể điền hoặc để trống (mặc định là 0đ).
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            /* STEP 2: PREVIEW TABLE */
            preview && (
              <div className="space-y-4">
                {/* Stats Summary Bar */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-center">
                    <span className="text-[11px] text-slate-500 block">Số nhân viên hợp lệ</span>
                    <span className="text-base font-bold text-emerald-700">
                      {preview.validCount}/{preview.totalRows} nhân sự
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-center">
                    <span className="text-[11px] text-slate-500 block">Tổng số giờ công</span>
                    <span className="text-base font-bold text-slate-800">
                      {preview.totalHours} giờ
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-center">
                    <span className="text-[11px] text-slate-500 block">Tổng quỹ lương dự kiến</span>
                    <span className="text-base font-bold text-emerald-700">
                      {formatVnd(BigInt(preview.totalPayrollVND || 0))}
                    </span>
                  </div>
                </div>

                {/* Table */}
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 sticky top-0 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Mã NV</th>
                        <th className="p-2.5">Họ và tên</th>
                        <th className="p-2.5">Chức vụ</th>
                        <th className="p-2.5 text-right">Số giờ</th>
                        <th className="p-2.5 text-right">Đơn giá/giờ</th>
                        <th className="p-2.5 text-right">Lương cơ bản</th>
                        <th className="p-2.5 text-right">Thực lĩnh</th>
                        <th className="p-2.5 text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.map((row, idx) => {
                        const isValid = row.status === "VALID";
                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-50 transition-colors ${
                              !isValid ? "bg-rose-50/50" : ""
                            }`}
                          >
                            <td className="p-2.5 font-mono font-semibold text-slate-800">
                              {row.employeeCode}
                            </td>
                            <td className="p-2.5 font-medium text-slate-900">
                              {row.fullName}
                            </td>
                            <td className="p-2.5 text-slate-500">{row.positionName}</td>
                            <td className="p-2.5 text-right font-bold text-slate-800">
                              {row.workedHours}h
                            </td>
                            <td className="p-2.5 text-right text-slate-600 font-mono">
                              {formatVnd(BigInt(row.hourlyRateVND || 0))}
                            </td>
                            <td className="p-2.5 text-right text-slate-600 font-mono">
                              {formatVnd(BigInt(row.basePayVND || 0))}
                            </td>
                            <td className="p-2.5 text-right font-bold text-emerald-700 font-mono">
                              {formatVnd(BigInt(row.totalPayVND || 0))}
                            </td>
                            <td className="p-2.5 text-center">
                              {isValid ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                                  ✓ Hợp lệ
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]" title={row.message}>
                                  Lỗi mã
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStep("UPLOAD");
                      setFile(null);
                      setPreview(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Chọn file khác
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClose}
                      className="text-xs"
                    >
                      Hủy bỏ
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={handleConfirmImport}
                      disabled={applying || preview.validCount === 0}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold gap-1.5 text-xs"
                    >
                      {applying ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Đang lưu bảng lương...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Xác nhận & Cập nhật Bảng lương ({preview.validCount} nhân sự)</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

