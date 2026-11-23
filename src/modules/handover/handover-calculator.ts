/**
 * D'lat Cafe - Shift Handover & Reconciliation Calculator
 * Implements business formulas specified in PRD Chapters 4 & 6.
 */

export interface CashReconciliationInput {
  openingCashVnd: bigint;
  cashSalesVnd: bigint;
  cashExpensesVnd: bigint;
  actualClosingCashVnd: bigint;
}

export interface CashReconciliationResult {
  expectedClosingCashVnd: bigint;
  cashDifferenceVnd: bigint;
  hasDiscrepancy: boolean;
  isShortage: boolean; // Thiếu tiền két (thực tế < dự kiến)
  isSurplus: boolean; // Dư tiền két (thực tế > dự kiến)
}

/**
 * Công thức đối soát tiền mặt cuối ca:
 * CashExpected = CashOpening + CashIn - CashOut
 * CashVariance = CashActual - CashExpected
 */
export function calculateCashReconciliation(
  input: CashReconciliationInput,
): CashReconciliationResult {
  const opening = BigInt(Math.round(Number(input?.openingCashVnd ?? 0)));
  const sales = BigInt(Math.round(Number(input?.cashSalesVnd ?? 0)));
  const expenses = BigInt(Math.round(Number(input?.cashExpensesVnd ?? 0)));
  const actual = BigInt(Math.round(Number(input?.actualClosingCashVnd ?? 0)));

  const expectedClosingCashVnd = opening + sales - expenses;
  const cashDifferenceVnd = actual - expectedClosingCashVnd;

  return {
    expectedClosingCashVnd,
    cashDifferenceVnd,
    hasDiscrepancy: cashDifferenceVnd !== 0n,
    isShortage: cashDifferenceVnd < 0n,
    isSurplus: cashDifferenceVnd > 0n,
  };
}

export interface ShiftWageInput {
  paidMinutes: number;
  hourlyRateVnd: bigint;
}

/**
 * Công thức tính lương ca làm việc:
 * Lương = (PaidMinutes / 60) * HourlyRate
 * Ví dụ PRD: 345 phút * 25.000đ / 60 = 143.750đ
 */
export function calculateShiftWage(input: ShiftWageInput): bigint {
  if (input.paidMinutes <= 0 || input.hourlyRateVnd <= 0n) {
    return 0n;
  }
  return (BigInt(input.paidMinutes) * input.hourlyRateVnd) / 60n;
}

export interface InventoryCheckItem {
  code: string;
  name: string;
  unit: string;
  quantity?: number;
  status: "SUFFICIENT" | "RUNNING_LOW" | "OUT_OF_STOCK" | "DAMAGED" | "EXPIRED";
  note?: string;
}

export interface EquipmentCheckItem {
  code: string;
  name: string;
  condition: "GOOD" | "NEEDS_CHECK" | "DAMAGED";
  note?: string;
}

export interface CleanlinessCheckItem {
  area: string;
  isClean?: boolean;
  isDone?: boolean;
  isDueToday?: boolean;
  scheduleLabel?: string;
  note?: string;
}

export interface PendingTaskItem {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  assignedToEmployeeId?: string;
  dueDate?: string;
  status: "PENDING" | "IN_PROGRESS" | "DONE";
}

export interface HandoverSubmissionInput {
  shiftId: string;
  fallbackShift?: {
    workDate?: string;
    templateCode?: string;
  };
  handoverEmployeeId: string;
  receivingEmployeeId?: string;
  reconciliation: CashReconciliationInput;
  cashDiscrepancyReason?: string;
  inventory: InventoryCheckItem[];
  equipment: EquipmentCheckItem[];
  cleanliness: CleanlinessCheckItem[];
  customerNotes?: string;
  pendingTasks?: PendingTaskItem[];
  handoverNotes?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Kiểm tra tính hợp lệ của phiếu bàn giao trước khi gửi
 */
export function validateHandoverSubmission(
  input: HandoverSubmissionInput,
): ValidationResult {
  const errors: string[] = [];

  if (!input.shiftId?.trim()) {
    errors.push("Mã ca làm việc không được để trống.");
  }
  if (!input.handoverEmployeeId?.trim()) {
    errors.push("Thông tin người giao ca không được để trống.");
  }

  // Đối soát tiền mặt
  if (
    Number(input.reconciliation.openingCashVnd ?? 0) < 0 ||
    Number(input.reconciliation.cashSalesVnd ?? 0) < 0 ||
    Number(input.reconciliation.cashExpensesVnd ?? 0) < 0 ||
    Number(input.reconciliation.actualClosingCashVnd ?? 0) < 0
  ) {
    errors.push("Số tiền két không được là số âm.");
  }

  const recon = calculateCashReconciliation(input.reconciliation);
  if (recon.hasDiscrepancy) {
    if (!input.cashDiscrepancyReason || input.cashDiscrepancyReason.trim().length < 5) {
      errors.push("Tiền quỹ có chênh lệch (" + recon.cashDifferenceVnd.toString() + "đ). Bắt buộc nhập lý do giải trình tối thiểu 5 ký tự.");
    } else if (input.cashDiscrepancyReason.trim().length > 500) {
      errors.push("Lý do giải trình chênh lệch tiền két tối đa 500 ký tự.");
    }
  }

  // Kiểm tra kho nguyên liệu tiêu hao nhanh cốt lõi
  if (!input.inventory || input.inventory.length === 0) {
    errors.push("Cần kiểm kê ít nhất danh mục nguyên liệu tiêu hao chính (Cà phê, Sữa, Trà, Đá, Ly).");
  }

  // Kiểm tra thiết bị
  if (!input.equipment || input.equipment.length === 0) {
    errors.push("Cần kiểm tra trạng thái các thiết bị cốt lõi (Máy pha, Máy xay, POS, Tủ lạnh).");
  }

  // Kiểm tra checklist công việc ca: mục đến hạn hôm nay chưa hoàn thành bắt buộc có ghi chú >= 3 ký tự
  if (Array.isArray(input.cleanliness) && input.cleanliness.length > 0) {
    const missingReasonItems = input.cleanliness.filter((item) => {
      const isDue = item.isDueToday !== false;
      const done = item.isDone ?? item.isClean ?? false;
      return isDue && !done && (!item.note || item.note.trim().length < 3);
    });
    if (missingReasonItems.length > 0) {
      const labels = missingReasonItems
        .slice(0, 3)
        .map((m) => m.area)
        .join(", ");
      errors.push(
        `Checklist còn mục chưa hoàn thành nhưng chưa ghi chú lý do (tối thiểu 3 ký tự): ${labels}${missingReasonItems.length > 3 ? ", ..." : ""}`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

