"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Edit2, Plus, Sparkles } from "lucide-react";
import type { PositionDto } from "@/modules/positions/position.types";
import { hasPermission } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";
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

const positionFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Mã vị trí tối thiểu 2 ký tự")
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Chỉ dùng chữ IN HOA không dấu, số và gạch dưới"),
  name: z.string().trim().min(2, "Tên vị trí tối thiểu 2 ký tự").max(120),
  description: z.string().trim().max(500).optional(),
  isPeakPriority: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
  isActive: z.boolean(),
});

type PositionFormValues = z.infer<typeof positionFormSchema>;

export function PositionsClient({
  initialPositions,
  actorRole,
}: {
  initialPositions: PositionDto[];
  actorRole: UserRole;
}) {
  const router = useRouter();
  const canEdit = hasPermission(actorRole, "positions:write");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PositionDto | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PositionFormValues>({
    resolver: zodResolver(positionFormSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      isPeakPriority: false,
      sortOrder: initialPositions.length + 1,
      isActive: true,
    },
  });

  function openCreate() {
    setEditing(null);
    setServerError(null);
    reset({
      code: "",
      name: "",
      description: "",
      isPeakPriority: false,
      sortOrder: initialPositions.length + 1,
      isActive: true,
    });
    setDialogOpen(true);
  }

  function openEdit(pos: PositionDto) {
    setEditing(pos);
    setServerError(null);
    reset({
      code: pos.code,
      name: pos.name,
      description: pos.description ?? "",
      isPeakPriority: pos.isPeakPriority,
      sortOrder: pos.sortOrder,
      isActive: pos.isActive,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: PositionFormValues) {
    setServerError(null);
    const url = editing ? `/api/positions/${editing.id}` : "/api/positions";
    const method = editing ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      setServerError(payload?.error?.message ?? "Không thể lưu vị trí");
      return;
    }

    setDialogOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Vị trí &amp; Kỹ năng công việc
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Danh mục chức vụ tại quán dùng để gán đa kỹ năng cho nhân viên và
            định biên nhân sự mỗi ca
          </p>
        </div>

        {canEdit && (
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span>Thêm vị trí mới</span>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thứ tự</TableHead>
                <TableHead>Mã</TableHead>
                <TableHead>Tên vị trí</TableHead>
                <TableHead>Mô tả công việc</TableHead>
                <TableHead>Giờ cao điểm</TableHead>
                <TableHead>Nhân sự đảm nhiệm</TableHead>
                <TableHead>Trạng thái</TableHead>
                {canEdit && <TableHead className="text-right">Thao tác</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialPositions.map((pos) => (
                <TableRow key={pos.id}>
                  <TableCell className="font-medium text-slate-500">
                    #{pos.sortOrder}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {pos.code}
                    </code>
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900">
                    {pos.name}
                  </TableCell>
                  <TableCell className="max-w-xs text-slate-600">
                    {pos.description || "—"}
                  </TableCell>
                  <TableCell>
                    {pos.isPeakPriority ? (
                      <Badge variant="warning" className="gap-1">
                        <Sparkles className="h-3 w-3" />
                        Ưu tiên kinh nghiệm
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Tiêu chuẩn
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      <strong>{pos.employeeCount}</strong> chính •{" "}
                      <strong>{pos.skilledCount}</strong> có kỹ năng
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={pos.isActive ? "default" : "secondary"}>
                      {pos.isActive ? "Đang hoạt động" : "Ngừng dùng"}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(pos)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>Sửa</span>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Chỉnh sửa vị trí: ${editing.name}` : "Thêm vị trí mới"}
            </DialogTitle>
            <DialogDescription>
              Thiết lập vị trí chuyên môn trong quán cà phê để phân ca chính xác
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {serverError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pos-code">Mã vị trí</Label>
                <Input
                  id="pos-code"
                  disabled={Boolean(editing)}
                  placeholder="VD: PHA_CHE"
                  {...register("code")}
                />
                {errors.code && (
                  <p className="text-xs text-red-600">{errors.code.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pos-order">Thứ tự hiển thị</Label>
                <Input
                  id="pos-order"
                  type="number"
                  min={0}
                  {...register("sortOrder")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pos-name">Tên vị trí (Tiếng Việt)</Label>
              <Input
                id="pos-name"
                placeholder="VD: Pha chế"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pos-desc">Mô tả nhiệm vụ</Label>
              <Input
                id="pos-desc"
                placeholder="Mô tả ngắn trách nhiệm trong ca"
                {...register("description")}
              />
            </div>

            <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-slate-50 p-3">
              <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  {...register("isPeakPriority")}
                />
                <span>
                  Ưu tiên nhân sự kỹ năng Nâng cao vào ca cao điểm
                </span>
              </label>

              {editing && (
                <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    {...register("isActive")}
                  />
                  <span>Vị trí đang hoạt động</span>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Đang lưu..." : "Lưu vị trí"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

