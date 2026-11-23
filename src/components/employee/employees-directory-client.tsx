"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, FileSpreadsheet, Plus, Search, UserPlus } from "lucide-react";
import type {
  EmployeeStatus,
  SkillProficiency,
  UserRole,
} from "@prisma/client";
import type { EmployeeSummaryDto } from "@/modules/employees/employee.types";
import type { PositionDto } from "@/modules/positions/position.types";
import { formatVnd } from "@/lib/currency";
import { DAY_OF_WEEK_LABELS_VN, formatDateVN } from "@/lib/date";
import { hasPermission } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { EmployeeCsvImportModal } from "./employee-csv-import-modal";

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Chủ quán",
  MANAGER: "Quản lý",
  EMPLOYEE: "Nhân viên",
};

const PROFICIENCY_LABELS: Record<SkillProficiency, string> = {
  BASIC: "Cơ bản",
  INTERMEDIATE: "Thành thạo",
  ADVANCED: "Nâng cao",
};

export function EmployeesDirectoryClient({
  initialEmployees,
  positions,
  actorRole,
}: {
  initialEmployees: EmployeeSummaryDto[];
  positions: PositionDto[];
  actorRole: UserRole;
}) {
  const router = useRouter();
  const canWrite = hasPermission(actorRole, "employees:write");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | EmployeeStatus>(
    "ALL",
  );
  const [positionFilter, setPositionFilter] = useState<string>("ALL");

  // Create Dialog State
  const [createOpen, setCreateOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [employeeCode, setEmployeeCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("Staff@123");
  const [role, setRole] = useState<UserRole>("EMPLOYEE");
  const [hireDate, setHireDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [primaryPositionId, setPrimaryPositionId] = useState(
    positions[0]?.id ?? "",
  );
  const [selectedSkills, setSelectedSkills] = useState<
    Record<string, SkillProficiency>
  >({});
  const [hourlyRate, setHourlyRate] = useState(25000);
  const [weeklyTargetHours, setWeeklyTargetHours] = useState(24);
  const [maxWeeklyHours, setMaxWeeklyHours] = useState(48);
  const [fixedRestDay, setFixedRestDay] = useState<string>("");
  const [internalNotes, setInternalNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredEmployees = useMemo(() => {
    return initialEmployees.filter((emp) => {
      if (statusFilter !== "ALL" && emp.status !== statusFilter) {
        return false;
      }
      if (positionFilter !== "ALL") {
        const matchPrimary = emp.primaryPosition.id === positionFilter;
        const matchSkill = emp.skills.some(
          (s) => s.positionId === positionFilter,
        );
        if (!matchPrimary && !matchSkill) {
          return false;
        }
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${emp.employeeCode} ${emp.fullName} ${emp.email} ${emp.phone}`.toLowerCase();
        if (!hay.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [initialEmployees, search, statusFilter, positionFilter]);

  function openCreateModal() {
    let maxNum = 0;
    for (const emp of initialEmployees) {
      const m = emp.employeeCode.match(/^NV(\d+)$/i);
      if (m && m[1]) {
        const n = Number.parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
    const nextIdx = Math.max(maxNum + 1, initialEmployees.length + 1);
    const defaultCode = `NV${String(nextIdx).padStart(3, "0")}`;
    const defaultPosId = positions[0]?.id ?? "";
    setEmployeeCode(defaultCode);
    setFullName("");
    setEmail("");
    setPhone("");
    setPassword("Dlat@2026");
    setRole("EMPLOYEE");
    setHireDate(new Date().toISOString().slice(0, 10));
    setPrimaryPositionId(defaultPosId);
    setSelectedSkills(
      defaultPosId ? { [defaultPosId]: "INTERMEDIATE" } : {},
    );
    setHourlyRate(25000);
    setWeeklyTargetHours(24);
    setMaxWeeklyHours(48);
    setFixedRestDay("");
    setInternalNotes("");
    setErrorMsg(null);
    setCreateOpen(true);
  }

  function toggleSkill(posId: string) {
    setSelectedSkills((prev) => {
      const next = { ...prev };
      if (next[posId]) {
        delete next[posId];
      } else {
        next[posId] = "INTERMEDIATE";
      }
      return next;
    });
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const skills = Object.entries(selectedSkills).map(
        ([positionId, proficiency]) => ({
          positionId,
          proficiency,
        }),
      );

      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeCode,
          fullName,
          email,
          phone,
          password,
          role,
          hireDate,
          primaryPositionId,
          skills,
          hourlyRate: Number(hourlyRate),
          weeklyTargetHours: Number(weeklyTargetHours),
          maxWeeklyHours: Number(maxWeeklyHours),
          fixedRestDay: fixedRestDay === "" ? null : Number(fixedRestDay),
          internalNotes: internalNotes || null,
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMsg(payload?.error?.message ?? "Không thể tạo nhân viên");
        return;
      }

      setCreateOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Danh bạ nhân sự
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý hồ sơ, vị trí đa kỹ năng, mục tiêu giờ làm và đơn giá lương
            theo giờ ({filteredEmployees.length}/{initialEmployees.length} nhân
            sự)
          </p>
        </div>

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCsvImportOpen(true)}
              className="min-h-[44px] flex-1 sm:flex-none"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Nhập từ CSV</span>
            </Button>
            <Button
              type="button"
              onClick={openCreateModal}
              className="min-h-[44px] flex-1 sm:flex-none"
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              <span>Thêm nhân viên</span>
            </Button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2 relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 sm:top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Tìm theo mã NV, họ tên, số điện thoại, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-[44px] sm:h-10 pl-9"
              />
            </div>

            <div>
              <select
                aria-label="Lọc theo trạng thái"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "ALL" | EmployeeStatus)
                }
                className="flex min-h-[44px] sm:h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
            </div>

            <div>
              <select
                aria-label="Lọc theo vị trí"
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="flex min-h-[44px] sm:h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="ALL">Tất cả vị trí</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Directory Table */}
      <Card>
        <CardContent className="p-0">
          {filteredEmployees.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm font-medium text-slate-800">
                Không tìm thấy nhân sự phù hợp bộ lọc
              </p>
              <p className="text-xs text-muted-foreground">
                Thử xóa từ khóa tìm kiếm hoặc chọn lại trạng thái hiển thị
              </p>
            </div>
          ) : (
            <>
            {/* Mobile Card View (< md) */}
            <div className="space-y-3 p-3 md:hidden">
              {filteredEmployees.map((emp) => (
                <div
                  key={`mob-${emp.id}`}
                  className="rounded-xl border border-border bg-white p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                          {emp.employeeCode}
                        </code>
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {emp.fullName}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {emp.phone} • {ROLE_LABELS[emp.role]}
                      </p>
                    </div>
                    <Badge
                      variant={emp.status === "ACTIVE" ? "default" : "secondary"}
                    >
                      {emp.status === "ACTIVE" ? "Đang làm" : "Ngừng"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default">{emp.primaryPosition.name}</Badge>
                    {emp.skills
                      .filter((sk) => sk.positionId !== emp.primaryPosition.id)
                      .map((sk) => (
                        <Badge key={sk.positionId} variant="outline">
                          {sk.positionName}
                        </Badge>
                      ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-border/60">
                    <span>
                      Đơn giá:{" "}
                      <strong className="text-emerald-700">
                        {formatVnd(emp.currentHourlyRate)}/h
                      </strong>
                    </span>
                    <span>
                      Mục tiêu: <strong>{emp.weeklyTargetHours}h</strong>/tuần
                    </span>
                  </div>

                  <Link
                    href={`/employees/${emp.id}`}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <span>Xem &amp; Chỉnh sửa hồ sơ</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>

            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã NV</TableHead>
                  <TableHead>Họ và tên</TableHead>
                  <TableHead>Chức vụ &amp; Kỹ năng</TableHead>
                  <TableHead>Mục tiêu tuần</TableHead>
                  <TableHead>Đơn giá giờ</TableHead>
                  <TableHead>Ngày vào làm</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hồ sơ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {emp.employeeCode}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900">
                        {emp.fullName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {emp.phone} • {ROLE_LABELS[emp.role]}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="default">
                          {emp.primaryPosition.name}
                        </Badge>
                        {emp.skills
                          .filter(
                            (sk) => sk.positionId !== emp.primaryPosition.id,
                          )
                          .map((sk) => (
                            <Badge key={sk.positionId} variant="outline">
                              {sk.positionName} ({PROFICIENCY_LABELS[sk.proficiency]})
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {emp.weeklyTargetHours}h
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">
                        (tối đa {emp.maxWeeklyHours}h)
                      </span>
                      {emp.fixedRestDay !== null && (
                        <div className="text-[11px] text-muted-foreground">
                          Nghỉ cố định:{" "}
                          {DAY_OF_WEEK_LABELS_VN[emp.fixedRestDay]}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-700">
                      {formatVnd(emp.currentHourlyRate)}/h
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {formatDateVN(emp.hireDate)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          emp.status === "ACTIVE" ? "default" : "secondary"
                        }
                      >
                        {emp.status === "ACTIVE"
                          ? "Đang làm việc"
                          : "Ngừng hoạt động"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/employees/${emp.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <span>Chi tiết</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Employee Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Thêm nhân viên mới</DialogTitle>
            <DialogDescription>
              Tạo đồng thời tài khoản đăng nhập, phân quyền, kỹ năng chuyên môn
              và mức lương khởi điểm
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="emp-code">Mã nhân viên</Label>
                <Input
                  id="emp-code"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="emp-name">Họ và tên</Label>
                <Input
                  id="emp-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="VD: Nguyễn Văn An"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="emp-email">Email đăng nhập</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="an.nguyen@dlatcafe.vn"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-phone">Số điện thoại</Label>
                <Input
                  id="emp-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0909123456"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-pass">Mật khẩu ban đầu</Label>
                <Input
                  id="emp-pass"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="emp-role">Vai trò hệ thống</Label>
                <select
                  id="emp-role"
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
                <Label htmlFor="emp-pos">Chức vụ chính</Label>
                <select
                  id="emp-pos"
                  value={primaryPositionId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPrimaryPositionId(id);
                    setSelectedSkills((prev) => ({
                      ...prev,
                      [id]: prev[id] ?? "INTERMEDIATE",
                    }));
                  }}
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emp-hire">Ngày bắt đầu làm việc</Label>
                <Input
                  id="emp-hire"
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="emp-rate">Mức lương (VND/giờ)</Label>
                <Input
                  id="emp-rate"
                  type="number"
                  step={1000}
                  min={1000}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-target">Giờ mục tiêu/tuần</Label>
                <Input
                  id="emp-target"
                  type="number"
                  min={0}
                  max={84}
                  value={weeklyTargetHours}
                  onChange={(e) => setWeeklyTargetHours(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-max">Giờ tối đa/tuần</Label>
                <Input
                  id="emp-max"
                  type="number"
                  min={1}
                  max={84}
                  value={maxWeeklyHours}
                  onChange={(e) => setMaxWeeklyHours(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-rest">Ngày nghỉ cố định</Label>
                <select
                  id="emp-rest"
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
              <Label>Các vị trí kiêm nhiệm &amp; mức thành thạo</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-border bg-slate-50 p-3">
                {positions.map((pos) => {
                  const checked = Boolean(selectedSkills[pos.id]);
                  return (
                    <div
                      key={pos.id}
                      className="flex items-center justify-between gap-2 rounded bg-white border border-border px-3 py-1.5"
                    >
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSkill(pos.id)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                        />
                        <span>{pos.name}</span>
                      </label>
                      {checked && (
                        <select
                          value={selectedSkills[pos.id]}
                          onChange={(e) =>
                            setSelectedSkills((prev) => ({
                              ...prev,
                              [pos.id]: e.target.value as SkillProficiency,
                            }))
                          }
                          className="rounded border border-input px-2 py-0.5 text-xs"
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
              <Label htmlFor="emp-notes">Ghi chú nội bộ (Chỉ quản lý xem)</Label>
              <Input
                id="emp-notes"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Ghi chú hợp đồng, ca ưu tiên..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={submitting}>
                <Plus className="h-4 w-4" />
                <span>{submitting ? "Đang tạo..." : "Tạo hồ sơ nhân sự"}</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <EmployeeCsvImportModal
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        onImported={() => router.refresh()}
      />
    </div>
  );
}

