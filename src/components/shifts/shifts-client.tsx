"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Edit2, Flame, Plus, Users } from "lucide-react";
import type { UserRole } from "@prisma/client";
import type { ShiftTemplateDto } from "@/modules/shifts/shift-template.types";
import type { PositionDto } from "@/modules/positions/position.types";
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

export function ShiftsClient({
  initialTemplates,
  positions,
  actorRole,
}: {
  initialTemplates: ShiftTemplateDto[];
  positions: PositionDto[];
  actorRole: UserRole;
}) {
  const router = useRouter();
  const canEdit = hasPermission(actorRole, "shifts:write");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftTemplateDto | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("12:00");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [minStaff, setMinStaff] = useState(3);
  const [maxStaff, setMaxStaff] = useState(5);
  const [priority, setPriority] = useState(1);
  const [isPeak, setIsPeak] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [posCounts, setPosCounts] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setErrorMsg(null);
    setCode("");
    setName("");
    setStartTime("06:00");
    setEndTime("12:00");
    setBreakMinutes(0);
    setMinStaff(3);
    setMaxStaff(5);
    setPriority(1);
    setIsPeak(false);
    setIsActive(true);
    setPosCounts({});
    setDialogOpen(true);
  }

  function openEdit(tpl: ShiftTemplateDto) {
    setEditing(tpl);
    setErrorMsg(null);
    setCode(tpl.code);
    setName(tpl.name);
    setStartTime(tpl.startTime);
    setEndTime(tpl.endTime);
    setBreakMinutes(tpl.breakMinutes);
    setMinStaff(tpl.minStaff);
    setMaxStaff(tpl.maxStaff);
    setPriority(tpl.priority);
    setIsPeak(tpl.isPeak);
    setIsActive(tpl.isActive);
    const map: Record<string, number> = {};
    for (const r of tpl.positionRequirements) {
      map[r.positionId] = r.minCount;
    }
    setPosCounts(map);
    setDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const positionRequirements = Object.entries(posCounts)
      .filter(([, count]) => count > 0)
      .map(([positionId, minCount]) => ({
        positionId,
        minCount,
        maxCount: null,
      }));

    try {
      const url = editing
        ? `/api/shift-templates/${editing.id}`
        : "/api/shift-templates";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? {} : { code }),
          name,
          startTime,
          endTime,
          breakMinutes: Number(breakMinutes),
          minStaff: Number(minStaff),
          maxStaff: Number(maxStaff),
          priority: Number(priority),
          isPeak,
          isActive,
          positionRequirements,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMsg(payload?.error?.message ?? "Không thể lưu cấu hình ca");
        return;
      }

      setDialogOpen(false);
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
            Cấu hình khung ca làm việc
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý động thời gian bắt đầu/kết thúc, phút nghỉ giữa ca và định
            biên từng vị trí từ cơ sở dữ liệu
          </p>
        </div>

        {canEdit && (
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span>Thêm ca mẫu</span>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {initialTemplates.map((tpl) => {
          const hours = Math.round((tpl.netDurationMinutes / 60) * 10) / 10;
          return (
            <Card key={tpl.id} className={!tpl.isActive ? "opacity-65" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{tpl.name}</CardTitle>
                      {tpl.isPeak && (
                        <Badge variant="warning" className="gap-1">
                          <Flame className="h-3 w-3" />
                          Cao điểm
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      Mã ca: <code>{tpl.code}</code> • Mức ưu tiên #{tpl.priority}
                    </CardDescription>
                  </div>
                  <Badge variant={tpl.isActive ? "default" : "secondary"}>
                    {tpl.isActive ? "Đang bật" : "Tạm tắt"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-border px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-slate-800">
                    <Clock className="h-4 w-4 text-emerald-600" />
                    <span className="text-base font-semibold">
                      {tpl.startTime} – {tpl.endTime}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {hours} giờ công (nghỉ {tpl.breakMinutes}p)
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Users className="h-4 w-4 text-slate-400" />
                    Định biên nhân sự:
                  </span>
                  <span className="font-semibold text-slate-900">
                    Tối thiểu {tpl.minStaff} – Tối đa {tpl.maxStaff} người
                  </span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">
                    Vị trí yêu cầu trong ca:
                  </p>
                  {tpl.positionRequirements.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Chưa ràng buộc vị trí cụ thể
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {tpl.positionRequirements.map((req) => (
                        <Badge key={req.positionId} variant="outline">
                          {req.positionName}: tối thiểu {req.minCount}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="pt-2 border-t border-border flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(tpl)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>Chỉnh sửa ca</span>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Chỉnh sửa ${editing.name}` : "Tạo khung ca mẫu mới"}
            </DialogTitle>
            <DialogDescription>
              Giờ ca hỗ trợ cả ca trong ngày (06:00–12:00) lẫn ca qua đêm
              (22:00–02:00)
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-code">Mã ca</Label>
                <Input
                  id="tpl-code"
                  value={code}
                  disabled={Boolean(editing)}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="VD: CA_GAY"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Tên ca hiển thị</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Ca Sáng"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-start">Giờ bắt đầu (HH:mm)</Label>
                <Input
                  id="tpl-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-end">Giờ kết thúc (HH:mm)</Label>
                <Input
                  id="tpl-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-break">Phút nghỉ giữa ca</Label>
                <Input
                  id="tpl-break"
                  type="number"
                  min={0}
                  max={240}
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-min">Nhân sự tối thiểu</Label>
                <Input
                  id="tpl-min"
                  type="number"
                  min={1}
                  max={50}
                  value={minStaff}
                  onChange={(e) => setMinStaff(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-max">Nhân sự tối đa</Label>
                <Input
                  id="tpl-max"
                  type="number"
                  min={1}
                  max={50}
                  value={maxStaff}
                  onChange={(e) => setMaxStaff(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-prio">Mức ưu tiên (1-10)</Label>
                <Input
                  id="tpl-prio"
                  type="number"
                  min={1}
                  max={10}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Số lượng tối thiểu theo từng vị trí trong ca</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-lg border border-border bg-slate-50 p-3">
                {positions
                  .filter((p) => p.isActive)
                  .map((pos) => (
                    <div
                      key={pos.id}
                      className="flex items-center justify-between gap-2 rounded bg-white border border-border px-2.5 py-1.5"
                    >
                      <span className="text-xs font-medium text-slate-700 truncate">
                        {pos.name}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        className="w-12 rounded border border-input px-1.5 py-0.5 text-xs text-right"
                        value={posCounts[pos.id] ?? 0}
                        onChange={(e) =>
                          setPosCounts((prev) => ({
                            ...prev,
                            [pos.id]: Math.max(0, Number(e.target.value)),
                          }))
                        }
                      />
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPeak}
                  onChange={(e) => setIsPeak(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Đánh dấu là khung ca cao điểm</span>
              </label>

              {editing && (
                <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                  <span>Đang hoạt động</span>
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Đang lưu..." : "Lưu cấu hình ca"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

