"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import type { EmployeeCsvPreviewResult } from "@/modules/employees/employee-csv.service";
import { formatVnd } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EmployeeCsvImportModal({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmployeeCsvPreviewResult | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCsvText("");
      setFileName(null);
      setPreview(null);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
    onOpenChange(nextOpen);
  }

  async function runPreview(text: string) {
    if (!text.trim()) {
      setErrorMsg("Vui lòng chọn file CSV hoặc dán nội dung CSV");
      return;
    }
    setLoadingPreview(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/employees/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: text, mode: "preview" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPreview(null);
        setErrorMsg(json?.error?.message ?? "Không thể kiểm tra file CSV");
        return;
      }
      setPreview(json.data as EmployeeCsvPreviewResult);
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ khi xem trước CSV");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
    await runPreview(text);
  }

  async function handleCommit() {
    if (!csvText.trim()) return;
    setCommitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/employees/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          mode: "commit",
          skipInvalid,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(json?.error?.message ?? "Không thể nhập danh sách nhân viên");
        return;
      }
      const created = json.data?.createdCount ?? 0;
      const skipped = json.data?.skippedCount ?? 0;
      setSuccessMsg(
        `Đã nhập thành công ${created} nhân viên vào hệ thống${skipped > 0 ? ` (bỏ qua ${skipped} dòng lỗi)` : ""}.`,
      );
      setPreview(null);
      onImported();
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ khi lưu dữ liệu CSV");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <span>Nhập nhanh nhân viên từ file CSV</span>
          </DialogTitle>
          <DialogDescription>
            Tải file CSV mẫu chuẩn tiếng Việt, điền danh sách nhân viên thật của
            quán rồi tải lên để hệ thống kiểm tra trùng SĐT, trùng mã NV và định
            dạng trước khi lưu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Template + Upload */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-slate-50 p-3.5">
            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-900">
                Bước 1: Tải file mẫu &amp; Chọn file CSV
              </p>
              <p>
                Hỗ trợ mã chức vụ (<code>PHA_CHE</code>, <code>PHUC_VU</code>,{" "}
                <code>THU_NGAN</code>, <code>TRUONG_CA</code>...) hoặc tên tiếng
                Việt.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href="/api/employees/import-csv/template"
                download="mau-nhap-nhan-vien-dlat.csv"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 min-h-[40px]"
              >
                <Download className="h-4 w-4 text-emerald-600" />
                <span>Tải CSV mẫu</span>
              </a>
              <label className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 cursor-pointer min-h-[40px]">
                <Upload className="h-4 w-4" />
                <span>{fileName ? "Chọn file khác" : "Chọn file CSV"}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {fileName && (
            <p className="text-xs text-muted-foreground">
              File đã chọn: <strong className="text-slate-900">{fileName}</strong>
            </p>
          )}

          {/* Optional Paste Area */}
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="text-xs font-medium text-slate-700 cursor-pointer select-none">
              Hoặc dán trực tiếp nội dung CSV tại đây
            </summary>
            <div className="mt-2 space-y-2">
              <textarea
                rows={4}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="ma_nv,ho_ten,email,so_dien_thoai,chuc_vu_chinh,luong_gio..."
                className="w-full rounded-lg border border-input bg-card p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingPreview || !csvText.trim()}
                onClick={() => runPreview(csvText)}
              >
                {loadingPreview ? "Đang kiểm tra..." : "Xem trước & Kiểm tra lỗi"}
              </Button>
            </div>
          </details>

          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Step 2: Preview Table */}
          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">
                    Tổng: {preview.totalRows} dòng
                  </Badge>
                  <Badge variant="default">
                    Hợp lệ: {preview.validCount}
                  </Badge>
                  {preview.errorCount > 0 && (
                    <Badge variant="destructive">
                      Lỗi: {preview.errorCount}
                    </Badge>
                  )}
                </div>

                {preview.errorCount > 0 && preview.validCount > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipInvalid}
                      onChange={(e) => setSkipInvalid(e.target.checked)}
                    />
                    <span>Bỏ qua các dòng lỗi và chỉ lưu {preview.validCount} dòng hợp lệ</span>
                  </label>
                )}
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-border sticky top-0">
                    <tr>
                      <th className="px-2.5 py-2 font-semibold">Dòng</th>
                      <th className="px-2.5 py-2 font-semibold">Trạng thái</th>
                      <th className="px-2.5 py-2 font-semibold">Mã NV</th>
                      <th className="px-2.5 py-2 font-semibold">Họ tên</th>
                      <th className="px-2.5 py-2 font-semibold">SĐT / Email</th>
                      <th className="px-2.5 py-2 font-semibold">Chức vụ &amp; Lương</th>
                      <th className="px-2.5 py-2 font-semibold">Chi tiết kiểm tra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.rows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={
                          row.status === "ERROR" ? "bg-red-50/50" : "bg-white"
                        }
                      >
                        <td className="px-2.5 py-2 font-mono text-slate-500">
                          #{row.rowNumber}
                        </td>
                        <td className="px-2.5 py-2">
                          {row.status === "VALID" ? (
                            <Badge variant="default">Hợp lệ</Badge>
                          ) : (
                            <Badge variant="destructive">Lỗi</Badge>
                          )}
                        </td>
                        <td className="px-2.5 py-2 font-mono font-semibold">
                          {row.data.employeeCode || "—"}
                        </td>
                        <td className="px-2.5 py-2 font-medium text-slate-900">
                          {row.data.fullName || "—"}
                        </td>
                        <td className="px-2.5 py-2">
                          <div>{row.data.phone || "—"}</div>
                          <div className="text-muted-foreground">
                            {row.data.email || "—"}
                          </div>
                        </td>
                        <td className="px-2.5 py-2">
                          <div>
                            {row.data.primaryPositionName ??
                              row.data.primaryPositionInput ??
                              "—"}
                          </div>
                          <div className="text-emerald-700 font-medium">
                            {row.data.hourlyRate > 0
                              ? `${formatVnd(row.data.hourlyRate)}/h`
                              : "—"}
                          </div>
                        </td>
                        <td className="px-2.5 py-2">
                          {row.errors.length === 0 ? (
                            <span className="text-emerald-700">
                              Sẵn sàng lưu
                            </span>
                          ) : (
                            <ul className="space-y-0.5 text-red-700">
                              {row.errors.map((err, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-1"
                                >
                                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                  <span>{err}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Đóng
            </Button>
            {preview && preview.validCount > 0 && (
              <Button
                type="button"
                disabled={
                  committing || (!skipInvalid && preview.errorCount > 0)
                }
                onClick={handleCommit}
              >
                {committing
                  ? "Đang lưu nhân viên..."
                  : `Lưu ${preview.validCount} nhân viên hợp lệ`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
