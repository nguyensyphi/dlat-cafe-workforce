"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  Package,
  RotateCcw,
  Sparkles,
  Wrench,
  FileText,
  UserCheck,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatVnd } from "@/lib/currency";

export type EquipmentStatus = "GOOD" | "WARNING" | "BROKEN";

export interface EquipmentItem {
  name: string;
  status: EquipmentStatus;
  note: string;
}

interface ShiftHandoverWizardProps {
  shift: {
    id: string;
    workDate: string;
    name: string;
    startTime: string;
    endTime: string;
  };
  currentEmployee: {
    id: string;
    fullName: string;
    employeeCode: string;
  };
  colleagues: Array<{
    id: string;
    fullName: string;
    employeeCode: string;
  }>;
}

const DEFAULT_INVENTORY = [
  { item: "Cà phê hạt Blend D'Lat (kg)", currentQty: 8, unit: "kg", isLow: false },
  { item: "Sữa tươi thanh trùng Barista (hộp)", currentQty: 12, unit: "hộp", isLow: false },
  { item: "Trà Ô long Mộc Châu (g)", currentQty: 1500, unit: "g", isLow: false },
  { item: "Syrup Hạt Dẻ Hazelnut (chai)", currentQty: 2, unit: "chai", isLow: false },
  { item: "Đá viên sạch (bao)", currentQty: 4, unit: "bao", isLow: false },
  { item: "Ly giấy Takeaway 500ml (cái)", currentQty: 250, unit: "cái", isLow: false },
];

const DEFAULT_EQUIPMENT: EquipmentItem[] = [
  { name: "Máy pha cà phê La Marzocco Linea", status: "GOOD", note: "Áp suất 9 bar ổn định" },
  { name: "Máy xay cà phê Eureka Zenith", status: "GOOD", note: "Cỡ xay Espresso chuẩn" },
  { name: "Máy POS cảm ứng Sunmi T2", status: "GOOD", note: "Máy in bill hoạt động tốt" },
  { name: "Tủ lạnh mát công nghiệp Berjaya", status: "GOOD", note: "Nhiệt độ 4°C đạt chuẩn" },
];

const CLEANLINESS_AREAS = [
  "Quầy pha chế Barista",
  "Khu vực máy pha & máy xay",
  "Bồn rửa & khay úp ly",
  "Tủ mát bảo quản nguyên liệu",
  "Khu vực thanh toán Thu ngân",
  "Bàn ghế khu vực khách ngồi",
  "Thùng rác & phân loại rác",
  "Sàn nhà & lối đi cửa chính",
  "Khu vực vệ sinh Restroom",
];

const STEPS = [
  { num: 1, title: "Ca & Nhân sự", short: "Nhân sự" },
  { num: 2, title: "Kiểm quỹ két", short: "Quỹ két" },
  { num: 3, title: "Kho nguyên liệu", short: "Kho hàng" },
  { num: 4, title: "Thiết bị máy", short: "Máy móc" },
  { num: 5, title: "Vệ sinh 9 khu vực", short: "Vệ sinh" },
  { num: 6, title: "Khách hàng", short: "Khách hàng" },
  { num: 7, title: "Việc tồn đọng", short: "Tồn đọng" },
  { num: 8, title: "Ký nhận & Hoàn tất", short: "Ký nhận" },
];

export function ShiftHandoverWizard({
  shift,
  currentEmployee,
  colleagues,
}: ShiftHandoverWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Shift Info & Outgoing
  const [receivingEmployeeId, setReceivingEmployeeId] = useState<string>(
    colleagues[0]?.id || "",
  );

  // 2. Cash Reconciliation
  const [openingCash, setOpeningCash] = useState<number>(2000000);
  const [cashSales, setCashSales] = useState<number>(4500000);
  const [cashExpenses, setCashExpenses] = useState<number>(300000);
  const [actualCash, setActualCash] = useState<number>(6200000);
  const [discrepancyReason, setDiscrepancyReason] = useState("");

  const expectedClosing = openingCash + cashSales - cashExpenses;
  const cashDifference = actualCash - expectedClosing;
  const hasCashDiscrepancy = cashDifference !== 0;

  // 3. Inventory
  const [inventory, setInventory] = useState(DEFAULT_INVENTORY);

  // 4. Equipment
  const [equipment, setEquipment] = useState(DEFAULT_EQUIPMENT);

  // 5. Cleanliness
  const [cleanliness, setCleanliness] = useState<Record<string, boolean>>(
    CLEANLINESS_AREAS.reduce((acc, area) => ({ ...acc, [area]: true }), {}),
  );

  // 6. Orders & Customer notes
  const [customerNotes, setCustomerNotes] = useState("");

  // 7. Pending Tasks
  const [pendingTasks, setPendingTasks] = useState([
    "Bổ sung đá viên trước giờ cao điểm chiều",
    "Kiểm tra hạn sử dụng sữa tươi lô mới nhập",
  ]);
  const [newTaskInput, setNewTaskInput] = useState("");

  // 8. Notes
  const [handoverNotes, setHandoverNotes] = useState("");

  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const storageKey = `dlat_handover_draft_${shift.id}`;

  // Restore draft on mount
  useEffect(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          if (parsed.step) setStep(parsed.step);
          if (parsed.receivingEmployeeId !== undefined) setReceivingEmployeeId(parsed.receivingEmployeeId);
          if (parsed.openingCash !== undefined) setOpeningCash(Number(parsed.openingCash));
          if (parsed.cashSales !== undefined) setCashSales(Number(parsed.cashSales));
          if (parsed.cashExpenses !== undefined) setCashExpenses(Number(parsed.cashExpenses));
          if (parsed.actualCash !== undefined) setActualCash(Number(parsed.actualCash));
          if (parsed.discrepancyReason !== undefined) setDiscrepancyReason(parsed.discrepancyReason);
          if (parsed.inventory && Array.isArray(parsed.inventory)) setInventory(parsed.inventory);
          if (parsed.equipment && Array.isArray(parsed.equipment)) setEquipment(parsed.equipment);
          if (parsed.cleanliness && typeof parsed.cleanliness === "object") setCleanliness(parsed.cleanliness);
          if (parsed.customerNotes !== undefined) setCustomerNotes(parsed.customerNotes);
          if (parsed.pendingTasks && Array.isArray(parsed.pendingTasks)) setPendingTasks(parsed.pendingTasks);
          if (parsed.handoverNotes !== undefined) setHandoverNotes(parsed.handoverNotes);
          setHasRestoredDraft(true);
        }
      }
    } catch {
      // Ignore parse error
    }
  }, [storageKey]);

  // Auto-save draft on any state change
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const draft = {
        step,
        receivingEmployeeId,
        openingCash,
        cashSales,
        cashExpenses,
        actualCash,
        discrepancyReason,
        inventory,
        equipment,
        cleanliness,
        customerNotes,
        pendingTasks,
        handoverNotes,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Ignore quota error
    }
  }, [
    storageKey,
    step,
    receivingEmployeeId,
    openingCash,
    cashSales,
    cashExpenses,
    actualCash,
    discrepancyReason,
    inventory,
    equipment,
    cleanliness,
    customerNotes,
    pendingTasks,
    handoverNotes,
  ]);

  function handleClearDraft() {
    try {
      if (typeof window !== "undefined") localStorage.removeItem(storageKey);
    } catch {}
    setStep(1);
    setOpeningCash(2000000);
    setCashSales(4500000);
    setCashExpenses(300000);
    setActualCash(6200000);
    setDiscrepancyReason("");
    setInventory(DEFAULT_INVENTORY);
    setEquipment(DEFAULT_EQUIPMENT);
    setCleanliness(CLEANLINESS_AREAS.reduce((acc, area) => ({ ...acc, [area]: true }), {}));
    setCustomerNotes("");
    setPendingTasks([
      "Bổ sung đá viên trước giờ cao điểm chiều",
      "Kiểm tra hạn sử dụng sữa tươi lô mới nhập",
    ]);
    setHandoverNotes("");
    setHasRestoredDraft(false);
  }

  function handleAddTask() {
    if (!newTaskInput.trim()) return;
    setPendingTasks([...pendingTasks, newTaskInput.trim()]);
    setNewTaskInput("");
  }

  function handleRemoveTask(index: number) {
    setPendingTasks(pendingTasks.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError(null);
    if (hasCashDiscrepancy && discrepancyReason.trim().length < 5) {
      setError("Tiền két có chênh lệch. Bắt buộc nhập lý do giải trình ít nhất 5 ký tự.");
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/handovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: shift.id,
          handoverEmployeeId: currentEmployee.id,
          receivingEmployeeId: receivingEmployeeId || undefined,
          reconciliation: {
            openingCashVnd: openingCash,
            cashSalesVnd: cashSales,
            cashExpensesVnd: cashExpenses,
            actualClosingCashVnd: actualCash,
          },
          cashDiscrepancyReason: hasCashDiscrepancy ? discrepancyReason : undefined,
          inventory: inventory.map((i) => ({
            item: i.item,
            currentQty: Number(i.currentQty),
            unit: i.unit,
            condition: i.isLow ? "LOW" : "ENOUGH",
          })),
          equipment: equipment.map((e) => ({
            name: e.name,
            status: e.status,
            note: e.note,
          })),
          cleanliness: Object.entries(cleanliness).map(([area, isDone]) => ({
            area,
            isDone,
          })),
          customerNotes: customerNotes.trim() || undefined,
          pendingTasks,
          handoverNotes: handoverNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || "Gửi biên bản thất bại");
      }

      // Clean up local draft on successful submission
      try {
        if (typeof window !== "undefined") localStorage.removeItem(storageKey);
      } catch {}

      // Success -> Redirect to Clock-out scanner
      router.push("/employee/attendance?handoverSuccess=true");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Wizard Progress Stepper: Responsive Mobile Bar & Desktop Stepper */}
      <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border">
        {/* Mobile View: Compact Header & Progress Bar */}
        <div className="sm:hidden space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-amber-900">
              Bước {step}/8: {STEPS[step - 1]?.title ?? ""}
            </span>
            <span className="text-muted-foreground font-medium">
              {Math.round((step / 8) * 100)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(step / 8) * 100}%` }}
            />
          </div>
          <div className="grid grid-cols-8 gap-1 pt-1">
            {STEPS.map((s) => (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num)}
                aria-label={s.title}
                className={`h-7 rounded-md flex items-center justify-center text-xs font-semibold transition-all ${
                  step === s.num
                    ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-300"
                    : step > s.num
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {step > s.num ? "✓" : s.num}
              </button>
            ))}
          </div>
        </div>

        {/* Tablet & Desktop View: Full Stepper with Step Names */}
        <div className="hidden sm:flex items-center justify-between overflow-x-auto text-xs font-medium gap-2">
          {STEPS.map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num)}
              className={`flex flex-col items-center gap-1 min-w-[76px] transition-colors ${
                step === s.num
                  ? "text-amber-700 font-bold"
                  : step > s.num
                  ? "text-emerald-600"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step === s.num
                    ? "bg-amber-600 text-white shadow-sm"
                    : step > s.num
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {step > s.num ? "✓" : s.num}
              </span>
              <span className="truncate max-w-[80px]">{s.short}</span>
            </button>
          ))}
        </div>
      </div>

      {hasRestoredDraft && (
        <div className="p-3 rounded-xl bg-blue-50/90 text-blue-900 border border-blue-200 flex items-center justify-between text-xs shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Hệ thống đã tự động khôi phục dữ liệu kiểm kê chưa nộp từ thiết bị của bạn.</span>
          </div>
          <button
            type="button"
            onClick={handleClearDraft}
            className="text-blue-700 hover:text-blue-900 underline font-medium whitespace-nowrap ml-2"
          >
            Xóa nháp & Nhập lại
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-800 border border-red-200 flex items-center gap-3 text-sm animate-in fade-in">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Step 1: Shift & Personnel */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700 font-semibold">
              <ClipboardCheck className="h-5 w-5" />
              <span>Bước 1: Thông tin ca & Nhân sự bàn giao</span>
            </div>
            <CardDescription>
              Biên bản bàn giao ca là một phần của giờ làm việc trước khi chấm ra (CLOCK_OUT).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 border">
              <div>
                <Label className="text-xs text-muted-foreground">Ca làm việc</Label>
                <div className="text-sm font-semibold">{shift.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Ngày {shift.workDate} ({shift.startTime} - {shift.endTime})
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Người giao ca (Tôi)</Label>
                <div className="text-sm font-semibold">{currentEmployee.fullName}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Mã NV: {currentEmployee.employeeCode}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Người nhận bàn giao (Ca kế tiếp)</Label>
              <select
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                value={receivingEmployeeId}
                onChange={(e) => setReceivingEmployeeId(e.target.value)}
              >
                <option value="">-- Chưa có người nhận (Bàn giao cho Quản lý xác nhận sau) --</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.employeeCode})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Nếu ca sau chưa đến, biên bản sẽ chuyển sang trạng thái chờ Quản lý cửa hàng thẩm duyệt.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Cash Reconciliation */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700 font-semibold">
              <DollarSign className="h-5 w-5" />
              <span>Bước 2: Đối soát Doanh thu & Kiểm quỹ Két tiền mặt</span>
            </div>
            <CardDescription>
              Công thức: Tiền kỳ vọng = Tiền đầu ca + Doanh thu mặt - Chi quỹ mặt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <Label>Tiền đầu ca (VND)</Label>
                  <span className="text-xs text-muted-foreground font-mono">{formatVnd(openingCash)}</span>
                </div>
                <Input
                  type="number"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Doanh thu tiền mặt theo POS (VND)</Label>
                  <span className="text-xs text-muted-foreground font-mono">{formatVnd(cashSales)}</span>
                </div>
                <Input
                  type="number"
                  value={cashSales}
                  onChange={(e) => setCashSales(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Chi tiền mặt trong ca (VND)</Label>
                  <span className="text-xs text-muted-foreground font-mono">{formatVnd(cashExpenses)}</span>
                </div>
                <Input
                  type="number"
                  value={cashExpenses}
                  onChange={(e) => setCashExpenses(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="font-semibold text-amber-900">Tiền đếm thực tế trong két (VND)</Label>
                  <span className="text-xs font-semibold text-emerald-700 font-mono">{formatVnd(actualCash)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    value={actualCash}
                    onChange={(e) => setActualCash(Number(e.target.value))}
                    className="font-semibold text-emerald-700"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActualCash(expectedClosing)}
                    className="shrink-0 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 h-9"
                    title="Điền nhanh đúng số tiền kỳ vọng nếu két đã khớp hoàn hảo"
                  >
                    Khớp kỳ vọng
                  </Button>
                </div>
              </div>
            </div>

            {/* Reconciliation Summary Card */}
            <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tiền két kỳ vọng hệ thống:</span>
                <span className="font-semibold">{formatVnd(expectedClosing)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tiền két thực tế kiểm đếm:</span>
                <span className="font-semibold">{formatVnd(actualCash)}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="font-medium">Chênh lệch (Variance):</span>
                <span
                  className={`font-bold ${
                    cashDifference === 0
                      ? "text-emerald-700"
                      : cashDifference > 0
                      ? "text-blue-700"
                      : "text-red-700"
                  }`}
                >
                  {cashDifference > 0 ? "+" : ""}
                  {formatVnd(cashDifference)}
                  {cashDifference === 0 && " (Khớp 100%)"}
                </span>
              </div>
            </div>

            {hasCashDiscrepancy && (
              <div className="space-y-1.5 p-3 rounded-lg bg-red-50 border border-red-200">
                <Label className="text-red-800 text-xs font-semibold">
                  ⚠️ Phát hiện sai lệch tiền két! Bắt buộc giải trình (tối thiểu 5 ký tự):
                </Label>
                <Input
                  placeholder="Ví dụ: Khách thối nhầm tiền bill #1042, đã đối soát qua camera..."
                  value={discrepancyReason}
                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                  className="border-red-300 text-sm"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Raw Materials */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700 font-semibold">
              <Package className="h-5 w-5" />
              <span>Bước 3: Tồn kho nguyên vật liệu tiêu hao nhanh</span>
            </div>
            <CardDescription>
              Kiểm tra số lượng thực tế tại quầy để ca sau kịp thời chuẩn bị sơ chế hoặc yêu cầu nhập.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {inventory.map((item, idx) => (
              <div
                key={item.item}
                className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50 gap-4"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium">{item.item}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={item.currentQty}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setInventory((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, currentQty: val } : it)),
                        );
                      }}
                      className="w-24 text-right h-8"
                    />
                    <span className="text-xs text-muted-foreground w-8">{item.unit}</span>
                  </div>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isLow}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setInventory((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, isLow: checked } : it)),
                        );
                      }}
                    />
                    <span className={item.isLow ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                      Sắp hết
                    </span>
                  </label>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Equipment & Machinery */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700 font-semibold">
              <Wrench className="h-5 w-5" />
              <span>Bước 4: Tình trạng thiết bị & máy móc</span>
            </div>
            <CardDescription>
              Xác nhận tình trạng máy pha, máy xay, POS và tủ đông tủ mát trước khi bàn giao.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {equipment.map((eq, idx) => (
              <div key={eq.name} className="p-3 rounded-lg border bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{eq.name}</span>
                  <select
                    value={eq.status}
                    onChange={(e) => {
                      const nextStatus = e.target.value as EquipmentStatus;
                      setEquipment((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, status: nextStatus } : item,
                        ),
                      );
                    }}
                    className={`text-xs rounded px-2 py-1 font-semibold border ${
                      eq.status === "GOOD"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : eq.status === "WARNING"
                        ? "bg-amber-50 text-amber-800 border-amber-300"
                        : "bg-red-50 text-red-800 border-red-300"
                    }`}
                  >
                    <option value="GOOD">✓ Hoạt động tốt</option>
                    <option value="WARNING">⚠️ Cần bảo dưỡng</option>
                    <option value="BROKEN">❌ Hỏng / Cần thợ</option>
                  </select>
                </div>
                <Input
                  placeholder="Ghi chú về tình trạng máy móc..."
                  value={eq.note}
                  onChange={(e) => {
                    const nextNote = e.target.value;
                    setEquipment((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, note: nextNote } : item,
                      ),
                    );
                  }}
                  className="h-8 text-xs bg-white"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 5: Cleanliness Standards */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700 font-semibold">
              <Sparkles className="h-5 w-5" />
              <span>Bước 5: Tiêu chuẩn vệ sinh 9 khu vực</span>
            </div>
            <CardDescription>
              Đảm bảo 9 khu vực trọng yếu tại quán đã được dọn sạch sẽ trước khi kết ca.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CLEANLINESS_AREAS.map((area) => (
                <label
                  key={area}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                    cleanliness[area]
                      ? "bg-emerald-50/70 border-emerald-300 text-emerald-900"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={cleanliness[area] ?? false}
                    onChange={(e) =>
                      setCleanliness({ ...cleanliness, [area]: e.target.checked })
                    }
                    className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{area}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Orders & Customers */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700 font-semibold">
              <FileText className="h-5 w-5" />
              <span>Bước 6: Đơn hàng dở dang & Ghi chú khách hàng</span>
            </div>
            <CardDescription>
              Lưu ý khách quen, đơn giao ứng dụng Grab/Shopee dở dang hoặc khách để quên đồ.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Ghi chú cho ca tiếp theo về đơn & khách</Label>
              <textarea
                rows={4}
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Ví dụ: Khách bàn 4 gửi cọc giữ bàn cho tiệc sinh nhật tối nay; Khách để quên kính mắt màu đen tại bàn 2..."
                className="mt-1.5 w-full rounded-md border border-input bg-background p-3 text-sm shadow-sm"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 7: Pending Tasks */}
      {step === 7 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700 font-semibold">
              <ClipboardCheck className="h-5 w-5" />
              <span>Bước 7: Công việc tồn đọng cho ca sau</span>
            </div>
            <CardDescription>
              Liệt kê các đầu việc cần ca sau hoàn thành giúp vận hành quán liền mạch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Thêm đầu việc cần làm (ví dụ: Nấu thêm sốt caramel, luộc trân châu)..."
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTask();
                  }
                }}
              />
              <Button type="button" onClick={handleAddTask} variant="outline">
                Thêm việc
              </Button>
            </div>

            <div className="space-y-2">
              {pendingTasks.map((task, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-50 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-xs flex items-center justify-center font-medium">
                      {idx + 1}
                    </span>
                    {task}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTask(idx)}
                    className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 8: Confirmation & Signoff */}
      {step === 8 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-emerald-700 font-semibold">
              <UserCheck className="h-5 w-5" />
              <span>Bước 8: Ký nhận & Xác nhận bàn giao ca</span>
            </div>
            <CardDescription>
              Kiểm tra tổng thể biên bản trước khi nộp. Sau khi nộp thành công, bạn sẽ chuyển sang màn hình quét mã QR để chấm ra.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm space-y-2">
              <div className="font-semibold text-emerald-950 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Tóm tắt kết quả bàn giao:</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-emerald-900 text-xs">
                <li>Tiền két chênh lệch: {formatVnd(cashDifference)}</li>
                <li>Nguyên liệu tiêu hao: {inventory.length} mục đã kiểm kê</li>
                <li>Máy móc thiết bị: {equipment.length} máy đã rà soát</li>
                <li>Vệ sinh: {Object.values(cleanliness).filter(Boolean).length}/9 khu vực đạt chuẩn</li>
                <li>Công việc bàn giao ca sau: {pendingTasks.length} nhiệm vụ</li>
              </ul>
            </div>

            <div>
              <Label>Lời dặn hoặc ghi chú chung cho ca bàn giao</Label>
              <textarea
                rows={3}
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="Ghi chú thêm nếu có..."
                className="mt-1.5 w-full rounded-md border border-input bg-background p-3 text-sm shadow-sm"
              />
            </div>

            <div className="p-3 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs">
              💡 <strong>Lưu ý:</strong> Thời gian bạn thực hiện kiểm đếm và lập biên bản này được tính trọn vẹn vào giờ làm có trả lương của bạn.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile-Friendly Error Notification Above Action Buttons */}
      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 text-red-800 border border-red-200 flex items-center gap-2.5 text-sm animate-in fade-in">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-2">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep(step - 1)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/employee/attendance")}
          >
            Về Chấm công
          </Button>
        )}

        {step < 8 ? (
          <Button
            type="button"
            onClick={() => setStep(step + 1)}
            className="gap-2 bg-amber-700 hover:bg-amber-800 text-white"
          >
            Tiếp theo <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? "Đang nộp..." : (
              <>
                <Send className="h-4 w-4" /> Hoàn tất & Chấm ra (Clock-out)
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
