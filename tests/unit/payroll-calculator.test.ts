import { describe, expect, it } from "vitest";
import {
  calculateEmployeePayrollItem,
  calculateOvertimeHours,
  type CalculatePayrollInput,
} from "@/modules/payroll/payroll-calculator";

describe("Payroll Calculation Engine (Integer VND & Decimal Hours)", () => {
  it("calculates standard base pay accurately in integer VND", () => {
    const input: CalculatePayrollInput = {
      paidHours: 40.5, // 40h 30m
      hourlyRateSnapshot: 25_000n, // 25.000 VND / h
      overtimeHours: 0,
      overtimeMultiplier: 1.5,
      allowances: 0n,
      bonuses: 0n,
      deductions: 0n,
      adjustments: 0n,
    };

    const result = calculateEmployeePayrollItem(input);

    // 40.5 * 25,000 = 1,012,500 VND
    expect(result.basePay).toBe(1_012_500n);
    expect(result.overtimePay).toBe(0n);
    expect(result.totalPay).toBe(1_012_500n);
  });

  it("calculates overtime pay with multiplier (e.g. 1.5x) in integer VND", () => {
    const input: CalculatePayrollInput = {
      paidHours: 48,
      hourlyRateSnapshot: 30_000n, // 30,000 VND / h
      overtimeHours: 6.5, // 6.5h OT
      overtimeMultiplier: 1.5,
      allowances: 100_000n, // 100k phụ cấp trách nhiệm
      bonuses: 200_000n, // 200k thưởng chuyên cần
      deductions: 50_000n, // 50k trừ trễ
      adjustments: 0n,
    };

    const result = calculateEmployeePayrollItem(input);

    // Base = 48 * 30,000 = 1,440,000 VND
    expect(result.basePay).toBe(1_440_000n);
    // Overtime = 6.5 * 30,000 * 1.5 = 292,500 VND
    expect(result.overtimePay).toBe(292_500n);
    // Total = 1,440,000 + 292,500 + 100,000 + 200,000 - 50,000 = 1,982,500 VND
    expect(result.totalPay).toBe(1_982_500n);
  });

  it("floors total pay to 0n if deductions exceed earnings", () => {
    const input: CalculatePayrollInput = {
      paidHours: 2,
      hourlyRateSnapshot: 20_000n, // 40,000 VND base
      overtimeHours: 0,
      overtimeMultiplier: 1.5,
      allowances: 0n,
      bonuses: 0n,
      deductions: 100_000n, // deduction > earnings
      adjustments: 0n,
    };

    const result = calculateEmployeePayrollItem(input);

    expect(result.basePay).toBe(40_000n);
    expect(result.totalPay).toBe(0n);
  });

  it("splits standard hours and overtime hours beyond weekly limit", () => {
    // 52 total paid hours in week, standard limit is 44h
    const { regularHours, overtimeHours } = calculateOvertimeHours({
      totalPaidHours: 52,
      standardThresholdHours: 44,
    });

    expect(regularHours).toBe(44);
    expect(overtimeHours).toBe(8);
  });
});

