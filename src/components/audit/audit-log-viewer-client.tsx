"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { formatDateTimeVN } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AuditLogDto } from "@/modules/audit/audit.service";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  PAYROLL_PERIOD_CREATED: { label: "Tạo kỳ lương", color: "text-blue-600" },
  PAYROLL_CALCULATED: { label: "Tính toán bảng lương", color: "text-emerald-600" },
  PAYROLL_ITEM_UPDATED: { label: "Sửa phụ cấp/thưởng/khấu trừ", color: "text-amber-600" },
  PAYROLL_STATUS_REVIEWED: { label: "Rà soát bảng lương", color: "text-amber-600" },
  PAYROLL_STATUS_APPROVED: { label: "Phê duyệt bảng lương", color: "text-emerald-600" },
  PAYROLL_STATUS_PAID: { label: "Chi trả lương", color: "text-blue-600" },
  PAYROLL_STATUS_LOCKED: { label: "Khóa sổ bảng lương", color: "text-rose-600" },
  ATTENDANCE_CORRECTION: { label: "Hiệu chỉnh chấm công", color: "text-amber-600" },
  SCHEDULE_PUBLISHED: { label: "Xuất bản lịch làm việc", color: "text-emerald-600" },
  SCHEDULE_LOCKED: { label: "Khóa lịch làm việc", color: "text-gray-600" },
  WAGE_UPDATE: { label: "Cập nhật mức lương giờ", color: "text-purple-600" },
};

export function AuditLogViewerClient({
  initialLogs,
}: {
  initialLogs: AuditLogDto[];
}) {
  const [logs] = useState(initialLogs);
  const [selectedAction, setSelectedAction] = useState<string>("ALL");
  const [viewingLog, setViewingLog] = useState<AuditLogDto | null>(null);

  const filteredLogs = logs.filter((l) => {
    if (selectedAction !== "ALL" && l.action !== selectedAction) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nhật ký Hệ thống (Audit Logs)</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi toàn bộ lịch sử thay đổi mức lương, phân công ca, chấm công và phê duyệt bảng lương
        </p>
      </div>

      {/* Filter Bar */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Lọc theo hành động:</span>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              <option value="ALL">Tất cả hành động ({logs.length})</option>
              {Object.keys(ACTION_LABELS).map((key) => (
                <option key={key} value={key}>
                  {ACTION_LABELS[key]?.label || key}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Nhật ký Hoạt động ({filteredLogs.length} bản ghi)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Chưa có nhật ký hoạt động nào phù hợp.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="py-3 px-3">Thời gian</th>
                    <th className="py-3 px-3">Người thực hiện</th>
                    <th className="py-3 px-3">Hành động</th>
                    <th className="py-3 px-3">Đối tượng</th>
                    <th className="py-3 px-3">Lý do</th>
                    <th className="py-3 px-3 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLogs.map((log) => {
                    const info = ACTION_LABELS[log.action] || {
                      label: log.action,
                      color: "text-foreground",
                    };
                    return (
                      <tr key={log.id} className="hover:bg-muted/30">
                        <td className="py-3 px-3 text-xs text-muted-foreground">
                          {formatDateTimeVN(log.createdAt)}
                        </td>
                        <td className="py-3 px-3 font-medium">
                          {log.userName}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`font-semibold text-xs ${info.color}`}>
                            {info.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-muted-foreground">
                          {log.entityType} ({log.entityId.slice(0, 8)}...)
                        </td>
                        <td className="py-3 px-3 text-xs">
                          {log.reason || "—"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => setViewingLog(log)}
                            title="Xem chi tiết thay đổi"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: View Details */}
      {viewingLog && (
        <Dialog open onOpenChange={() => setViewingLog(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Chi tiết Nhật ký Kiểm toán</DialogTitle>
              <DialogDescription>
                Hành động: {ACTION_LABELS[viewingLog.action]?.label || viewingLog.action} — Lúc: {formatDateTimeVN(viewingLog.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <div>
                  <span className="text-muted-foreground block">Người thực hiện:</span>
                  <span className="font-semibold text-foreground">{viewingLog.userName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Đối tượng:</span>
                  <span className="font-medium text-foreground">{viewingLog.entityType} ({viewingLog.entityId})</span>
                </div>
                {viewingLog.reason && (
                  <div className="col-span-2 pt-1">
                    <span className="text-muted-foreground block">Lý do ghi nhận:</span>
                    <span className="font-medium text-foreground">{viewingLog.reason}</span>
                  </div>
                )}
              </div>

              {/* Old vs New JSON diff preview */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="font-semibold text-muted-foreground">Giá trị trước thay đổi:</span>
                  <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted p-2 font-mono text-[11px]">
                    {viewingLog.oldValues
                      ? JSON.stringify(viewingLog.oldValues, null, 2)
                      : "null (Tạo mới)"}
                  </pre>
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-emerald-600">Giá trị sau thay đổi:</span>
                  <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted p-2 font-mono text-[11px]">
                    {viewingLog.newValues
                      ? JSON.stringify(viewingLog.newValues, null, 2)
                      : "null"}
                  </pre>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setViewingLog(null)}>
                  Đóng
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
