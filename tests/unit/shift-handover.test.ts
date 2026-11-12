import { describe, expect, it } from "vitest";
import {
  calculateCashReconciliation,
  calculateShiftWage,
  validateHandoverSubmission,
} from "@/modules/handover/handover-calculator";

describe("Shift Handover & Reconciliation Calculator", () => {
  describe("calculateCashReconciliation", () => {
    it("correctly reconciles balanced cash drawer (no difference)", () => {
      // Đầu ca 1.000.000đ, thu 3.500.000đ, chi 500.000đ => Dự kiến 4.000.000đ
      const res = calculateCashReconciliation({
        openingCashVnd: 1000000n,
        cashSalesVnd: 3500000n,
        cashExpensesVnd: 500000n,
        actualClosingCashVnd: 4000000n,
      });

      expect(res.expectedClosingCashVnd).toBe(4000000n);
      expect(res.cashDifferenceVnd).toBe(0n);
      expect(res.hasDiscrepancy).toBe(false);
      expect(res.isShortage).toBe(false);
      expect(res.isSurplus).toBe(false);
    });

    it("correctly reconciles balanced cash drawer when passed JSON numbers at runtime", () => {
      // Khi gửi qua JSON API, số được parse thành number: 2.000.000 + 4.500.000 - 300.000 = 6.200.000
      const res = calculateCashReconciliation({
        openingCashVnd: 2000000 as unknown as bigint,
        cashSalesVnd: 4500000 as unknown as bigint,
        cashExpensesVnd: 300000 as unknown as bigint,
        actualClosingCashVnd: 6200000 as unknown as bigint,
      });

      expect(res.expectedClosingCashVnd).toBe(6200000n);
      expect(res.cashDifferenceVnd).toBe(0n);
      expect(res.hasDiscrepancy).toBe(false);
    });

    it("detects cash shortage (thực tế đếm ít hơn dự kiến)", () => {
      // Dự kiến 4.000.000đ, nhưng két chỉ có 3.950.000đ => Lệch -50.000đ
      const res = calculateCashReconciliation({
        openingCashVnd: 1000000n,
        cashSalesVnd: 3500000n,
        cashExpensesVnd: 500000n,
        actualClosingCashVnd: 3950000n,
      });

      expect(res.expectedClosingCashVnd).toBe(4000000n);
      expect(res.cashDifferenceVnd).toBe(-50000n);
      expect(res.hasDiscrepancy).toBe(true);
      expect(res.isShortage).toBe(true);
      expect(res.isSurplus).toBe(false);
    });

    it("detects cash surplus (thực tế đếm nhiều hơn dự kiến)", () => {
      // Dự kiến 4.000.000đ, nhưng két có 4.020.000đ => Lệch +20.000đ
      const res = calculateCashReconciliation({
        openingCashVnd: 1000000n,
        cashSalesVnd: 3500000n,
        cashExpensesVnd: 500000n,
        actualClosingCashVnd: 4020000n,
      });

      expect(res.cashDifferenceVnd).toBe(20000n);
      expect(res.hasDiscrepancy).toBe(true);
      expect(res.isShortage).toBe(false);
      expect(res.isSurplus).toBe(true);
    });
  });

  describe("calculateShiftWage", () => {
    it("matches exact PRD example: 345 minutes at 25,000 VND/hr = 143,750 VND", () => {
      const wage = calculateShiftWage({
        paidMinutes: 345,
        hourlyRateVnd: 25000n,
      });

      expect(wage).toBe(143750n);
    });

    it("calculates round hours accurately (360 minutes at 30,000 VND/hr = 180,000 VND)", () => {
      const wage = calculateShiftWage({
        paidMinutes: 360,
        hourlyRateVnd: 30000n,
      });

      expect(wage).toBe(180000n);
    });

    it("handles zero or negative minutes safely", () => {
      expect(calculateShiftWage({ paidMinutes: 0, hourlyRateVnd: 25000n })).toBe(0n);
      expect(calculateShiftWage({ paidMinutes: -30, hourlyRateVnd: 25000n })).toBe(0n);
    });
  });

  describe("validateHandoverSubmission", () => {
    const validBase = {
      shiftId: "shift-123",
      handoverEmployeeId: "emp-001",
      reconciliation: {
        openingCashVnd: 1000000n,
        cashSalesVnd: 2000000n,
        cashExpensesVnd: 0n,
        actualClosingCashVnd: 3000000n,
      },
      inventory: [
        { code: "CF", name: "Cà phê", unit: "kg", status: "SUFFICIENT" as const },
      ],
      equipment: [
        { code: "ESPRESSO", name: "Máy pha", condition: "GOOD" as const },
      ],
      cleanliness: [{ area: "Quầy bar", isClean: true }],
    };

    it("passes when all sections are valid and cash is balanced", () => {
      const val = validateHandoverSubmission(validBase);
      expect(val.isValid).toBe(true);
      expect(val.errors).toHaveLength(0);
    });

    it("requires explanation if cash difference exists", () => {
      const withDiscrepancy = {
        ...validBase,
        reconciliation: {
          ...validBase.reconciliation,
          actualClosingCashVnd: 2980000n, // Thiếu 20k
        },
        cashDiscrepancyReason: "", // Không có lý do
      };

      const val = validateHandoverSubmission(withDiscrepancy);
      expect(val.isValid).toBe(false);
      expect(val.errors.some((e) => e.includes("lý do giải trình"))).toBe(true);
    });

    it("passes with explanation when cash difference exists", () => {
      const withExplanation = {
        ...validBase,
        reconciliation: {
          ...validBase.reconciliation,
          actualClosingCashVnd: 2980000n,
        },
        cashDiscrepancyReason: "Khách thối thiếu 20k tiền lẻ quên lấy",
      };

      const val = validateHandoverSubmission(withExplanation);
      expect(val.isValid).toBe(true);
    });

    it("rejects negative cash amounts in drawer reconciliation", () => {
      const withNegativeCash = {
        ...validBase,
        reconciliation: {
          ...validBase.reconciliation,
          cashExpensesVnd: -50000n, // Số âm không hợp lệ
        },
      };

      const val = validateHandoverSubmission(withNegativeCash);
      expect(val.isValid).toBe(false);
      expect(val.errors.some((e) => e.includes("không được là số âm"))).toBe(true);
    });

    it("rejects cash discrepancy reason exceeding 500 characters", () => {
      const withLongExplanation = {
        ...validBase,
        reconciliation: {
          ...validBase.reconciliation,
          actualClosingCashVnd: 2980000n,
        },
        cashDiscrepancyReason: "A".repeat(501),
      };

      const val = validateHandoverSubmission(withLongExplanation);
      expect(val.isValid).toBe(false);
      expect(val.errors.some((e) => e.includes("tối đa 500 ký tự"))).toBe(true);
    });
  });
});

