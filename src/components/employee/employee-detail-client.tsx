"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  DollarSign,
  Edit2,
  History,
  Power,
  ShieldCheck,
} from "lucide-react";
import type { SkillProficiency, UserRole } from "@prisma/client";
import type { EmployeeDetailDto } from "@/modules/employees/employee.types";
import type { PositionDto } from "@/modules/positions/position.types";
import { formatVnd } from "@/lib/currency";
import { DAY_OF_WEEK_LABELS_VN, formatDateVN } from "@/lib/date";
import { hasPermission } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PROFICIENCY_LABELS: Record<SkillProficiency, string> = {
  BASIC: "Cơ bản",
  INTERMEDIATE: "Thành thạo",
  ADVANCED: "Nâng cao",
};

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Chủ quán",
  MANAGER: "Quản lý",
  EMPLOYEE: "Nhân viên",
};

export function EmployeeDetailClient({
  employee,
  positions,
  actorRole,
}: {
  employee: EmployeeDetailDto;
  positions: PositionDto[];
  actorRole: UserRole;
}) {
  const router = useRouter();
  const canWrite = hasPermission(actorRole, "employees:write");
  const canEditWage = hasPermission(actorRole, "pay_rates:write");

  // Edit profile state
  const [editOpen, setEditOpen] = useState(false);
  const [fullName, setFullName] = useState(employee.fullName);
  const [phone, setPhone] = useState(employee.phone);
  const [role, setRole] = useState<UserRole>(employee.role);
  const [primaryPositionId, setPrimaryPositionId] = useState(
    employee.primaryPosition.id,
  );
  const [weeklyTargetHours, setWeeklyTargetHours] = useState(
    employee.weeklyTargetHours,
  );
  const [maxWeeklyHours, setMaxWeeklyHours] = useState(employee.maxWeeklyHours);
  const [fixedRestDay, setFixedRestDay] = useState<string>(
    employee.fixedRestDay === null ? "" : String(employee.fixedRestDay),
  );
  const [internalNotes, setInternalNotes] = useState(
    employee.internalNotes ?? "",
  );
  const [skillsMap, setSkillsMap] = useState<Record<string, SkillProficiency>>(
    () => {
      const m: Record<string, SkillProficiency> = {};
      for (const sk of employee.skills) {
        m[sk.positionId] = sk.proficiency;
      }
      return m;
    },
  );

  // Add pay rate dialog state
  const [wageOpen, setWageOpen] = useState(false);
  const [newHourlyRate, setNewHourlyRate] = useState(
    Number(employee.currentHourlyRate),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [wageNote, setWageNote] = useState("");

  // Toggle status dialog state
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusReason, setStatusReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const skills = Object.entries(skillsMap).map(
        ([positionId, proficiency]) => ({
          positionId,
          proficiency,
        }),
      );
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          role,
          primaryPositionId,
          skills,
          weeklyTargetHours: Number(weeklyTargetHours),
          maxWeeklyHours: Number(maxWeeklyHours),
          fixedRestDay: fixedRestDay === "" ? null : Number(fixedRestDay),
          internalNotes: internalNotes || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMsg(payload?.error?.message ?? "Không thể lưu hồ sơ");
        return;
      }
      setEditOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddWage(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/employees/${employee.id}/pay-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hourlyRate: Number(newHourlyRate),
          effectiveFrom,
          note: wageNote || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMsg(payload?.error?.message ?? "Không thể cập nhật mức lương");
        return;
      }
      setWageOpen(false);
      setWageNote("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    const nextStatus = employee.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const res = await fetch(`/api/employees/${employee.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          reason: statusReason,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMsg(
          payload?.error?.message ?? "Không thể cập nhật trạng thái nhân sự",
        );
        return;
      }
      setStatusOpen(false);
      setStatusReason("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/employees"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Quay lại danh bạ nhân sự</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {employee.fullName}
            </h1>
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {employee.employeeCode}
            </code>
            <Badge
              variant={employee.status === "ACTIVE" ? "default" : "secondary"}
            >
              {employee.status === "ACTIVE"
                ? "Đang làm việc"
                : "Ngừng hoạt động"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEditWage && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setErrorMsg(null);
                setWageOpen(true);
              }}
            >
              <DollarSign className="h-4 w-4" />
              <span>Điều chỉnh lương</span>
            </Button>
          )}
          {canWrite && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setErrorMsg(null);
                  setEditOpen(true);
                }}
              >
                <Edit2 className="h-4 w-4" />
                <span>Chỉnh sửa</span>
              </Button>
              <Button
                type="button"
                variant={
                  employee.status === "ACTIVE" ? "destructive" : "default"
                }
                onClick={() => {
                  setErrorMsg(null);
                  setStatusOpen(true);
                }}
              >
                <Power className="h-4 w-4" />
                <span>
                  {employee.status === "ACTIVE"
                    ? "Khóa / Nghỉ việc"
                    : "Kích hoạt lại"}
                </span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thông tin cá nhân &amp; Định mức làm việc</CardTitle>
            <CardDescription>
              Dữ liệu gốc phục vụ phân ca tự động và tính lương theo giờ
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Email đăng nhập</p>
              <p className="font-medium text-slate-900 mt-0.5">
                {employee.email}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Số điện thoại</p>
              <p className="font-medium text-slate-900 mt-0.5">
                {employee.phone}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vai trò hệ thống</p>
              <p className="font-medium text-slate-900 mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                {ROLE_LABELS[employee.role]}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ngày vào làm</p>
              <p className="font-medium text-slate-900 mt-0.5">
                {formatDateVN(employee.hireDate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Giờ làm mục tiêu / Giới hạn tuần
              </p>
              <p className="font-medium text-slate-900 mt-0.5">
                {employee.weeklyTargetHours} giờ / Tối đa{" "}
                {employee.maxWeeklyHours} giờ
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ngày nghỉ cố định</p>
              <p className="font-medium text-slate-900 mt-0.5">
                {employee.fixedRestDay === null
                  ? "Linh hoạt theo lịch đăng ký"
                  : DAY_OF_WEEK_LABELS_VN[employee.fixedRestDay]}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground mb-1.5">
                Chức vụ chính &amp; Kỹ năng đảm nhiệm
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">
                  Chính: {employee.primaryPosition.name}
                </Badge>
                {employee.skills.map((sk) => (
                  <Badge key={sk.positionId} variant="outline">
                    {sk.positionName} • {PROFICIENCY_LABELS[sk.proficiency]}
                  </Badge>
                ))}
              </div>
            </div>
            {employee.internalNotes && (
              <div className="sm:col-span-2 rounded-lg bg-slate-50 border border-border p-3">
                <p className="text-xs font-medium text-slate-500">
                  Ghi chú nội bộ quản lý:
                </p>
                <p className="text-sm text-slate-800 mt-1">
                  {employee.internalNotes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Đơn giá lương hiện hành</CardTitle>
            <CardDescription>
              Áp dụng cho kỳ tính lương hiện tại (không ghi đè lịch sử cũ)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-xs font-medium text-emerald-700">
                Mức lương theo giờ
              </p>
              <p className="text-3xl font-bold text-emerald-800 mt-1">
                {formatVnd(employee.currentHourlyRate)}
                <span className="text-sm font-normal text-emerald-700">
                  {" "}
                  / giờ
                </span>
              </p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                Ước tính thu nhập tuần mục tiêu ({employee.weeklyTargetHours}h):{" "}
                <strong className="text-slate-800">
                  {formatVnd(
                    BigInt(employee.currentHourlyRate) *
                      BigInt(Math.round(employee.weeklyTargetHours)),
                  )}
                </strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pay Rate History & Employment History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử mức lương</CardTitle>
            <CardDescription>
              Mọi lần điều chỉnh lương đều tạo bản ghi mới để bảo toàn kỳ lương cũ
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đơn giá / giờ</TableHead>
                  <TableHead>Hiệu lực từ</TableHead>
                  <TableHead>Đến ngày</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employee.payRates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-semibold text-emerald-700">
                      {formatVnd(rate.hourlyRate)}
                    </TableCell>
                    <TableCell>{formatDateVN(rate.effectiveFrom)}</TableCell>
                    <TableCell>
                      {rate.effectiveTo ? (
                        formatDateVN(rate.effectiveTo)
                      ) : (
                        <Badge variant="default">Đang áp dụng</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {rate.note || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-emerald-600" />
              <span>Lịch sử công tác</span>
            </CardTitle>
            <CardDescription>
              Theo dõi quá trình nhận việc, chuyển vị trí và thay đổi trạng thái
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {employee.employmentHistory.map((ev) => (
              <div
                key={ev.id}
                className="rounded-lg border border-border px-3.5 py-2.5 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary">{ev.eventType}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateVN(ev.effectiveDate)}
                  </span>
                </div>
                <p className="text-slate-800 font-medium mt-1.5">
                  {ev.summary}
                </p>
                {ev.recordedByEmail && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ghi nhận bởi: {ev.recordedByEmail}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Edit Profile Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa hồ sơ nhân viên</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin liên hệ, chức vụ chính và bộ kỹ năng làm việc
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Họ và tên</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Số điện thoại</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vai trò hệ thống</Label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  <option value="EMPLOYEE">Nhân viên</option>
                  <option value="MANAGER">Quản lý</option>
                  <option value="OWNER">Chủ quán</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Chức vụ chính</Label>
                <select
                  value={primaryPositionId}
                  onChange={(e) => setPrimaryPositionId(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Giờ mục tiêu/tuần</Label>
                <Input
                  type="number"
                  min={0}
                  max={84}
                  value={weeklyTargetHours}
                  onChange={(e) => setWeeklyTargetHours(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Giờ tối đa/tuần</Label>
                <Input
                  type="number"
                  min={1}
                  max={84}
                  value={maxWeeklyHours}
                  onChange={(e) => setMaxWeeklyHours(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nghỉ cố định</Label>
                <select
                  value={fixedRestDay}
                  onChange={(e) => setFixedRestDay(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  <option value="">Linh hoạt</option>
                  {Object.entries(DAY_OF_WEEK_LABELS_VN).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Kỹ năng đảm nhiệm</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-border bg-slate-50 p-3">
                {positions.map((pos) => {
                  const checked = Boolean(skillsMap[pos.id]);
                  return (
                    <div
                      key={pos.id}
                      className="flex items-center justify-between gap-2 rounded bg-white border border-border px-2.5 py-1.5"
                    >
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSkillsMap((prev) => {
                              const next = { ...prev };
                              if (next[pos.id]) {
                                delete next[pos.id];
                              } else {
                                next[pos.id] = "INTERMEDIATE";
                              }
                              return next;
                            })
                          }
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                        />
                        <span>{pos.name}</span>
                      </label>
                      {checked && (
                        <select
                          value={skillsMap[pos.id]}
                          onChange={(e) =>
                            setSkillsMap((prev) => ({
                              ...prev,
                              [pos.id]: e.target.value as SkillProficiency,
                            }))
                          }
                          className="rounded border border-input px-1.5 py-0.5 text-xs"
                        >
                          <option value="BASIC">Cơ bản</option>
                          <option value="INTERMEDIATE">Thành thạo</option>
                          <option value="ADVANCED">Nâng cao</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Ghi chú nội bộ</Label>
              <Input
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Đang lưu..." : "Lưu cập nhật"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Wage Adjustment Modal */}
      <Dialog open={wageOpen} onOpenChange={setWageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Điều chỉnh mức lương theo giờ</DialogTitle>
            <DialogDescription>
              Đơn giá cũ sẽ được tự động đóng ngày kết thúc để không làm sai
              lệch bảng lương lịch sử
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddWage} className="space-y-4">
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new-rate">Đơn giá mới (VND / giờ)</Label>
              <Input
                id="new-rate"
                type="number"
                step={1000}
                min={1000}
                value={newHourlyRate}
                onChange={(e) => setNewHourlyRate(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eff-from">Ngày bắt đầu áp dụng</Label>
              <Input
                id="eff-from"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wage-note">Lý do điều chỉnh</Label>
              <Input
                id="wage-note"
                value={wageNote}
                onChange={(e) => setWageNote(e.target.value)}
                placeholder="VD: Đạt đánh giá định kỳ 6 tháng"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setWageOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Đang lưu..." : "Xác nhận mức lương mới"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate / Reactivate Modal */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {employee.status === "ACTIVE"
                ? "Khóa tài khoản / Cho nghỉ việc"
                : "Kích hoạt lại nhân viên"}
            </DialogTitle>
            <DialogDescription>
              Hệ thống không xóa cứng nhân sự để bảo toàn 100% lịch sử chấm công
              và bảng lương
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleToggleStatus} className="space-y-4">
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="status-reason">Lý do thay đổi trạng thái</Label>
              <Input
                id="status-reason"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="VD: Nghỉ việc theo nguyện vọng cá nhân"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStatusOpen(false)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                variant={
                  employee.status === "ACTIVE" ? "destructive" : "default"
                }
                disabled={submitting}
              >
                {submitting ? "Đang xử lý..." : "Xác nhận"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

