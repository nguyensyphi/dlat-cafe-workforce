export interface CalculatePayrollInput {
  paidHours: number;
  hourlyRateSnapshot: bigint;
  overtimeHours?: number;
  overtimeMultiplier?: number;
  allowances?: bigint;
  bonuses?: bigint;
  deductions?: bigint;
  adjustments?: bigint;
}

export interface PayrollCalculationOutput {
  basePay: bigint;
  overtimePay: bigint;
  allowances: bigint;
  bonuses: bigint;
  deductions: bigint;
  adjustments: bigint;
  totalPay: bigint;
}

/**
 * Calculates an employee's payroll item ensuring exact integer VND arithmetic.
 * Never allows fractional VND or floating-point rounding errors.
 */
export function calculateEmployeePayrollItem({
  paidHours,
  hourlyRateSnapshot,
  overtimeHours = 0,
  overtimeMultiplier = 1.5,
  allowances = 0n,
  bonuses = 0n,
  deductions = 0n,
  adjustments = 0n,
}: CalculatePayrollInput): PayrollCalculationOutput {
  // Base pay = round(paidHours * hourlyRateSnapshot)
  const basePay = BigInt(Math.round(paidHours * Number(hourlyRateSnapshot)));

  // Overtime pay = round(overtimeHours * hourlyRateSnapshot * overtimeMultiplier)
  const overtimePay =
    overtimeHours > 0
      ? BigInt(
          Math.round(
            overtimeHours * Number(hourlyRateSnapshot) * overtimeMultiplier,
          ),
        )
      : 0n;

  // Gross and Net Pay
  const grossPay = basePay + overtimePay + allowances + bonuses + adjustments;
  const netPay = grossPay - deductions;

  // Never allow negative salary payout
  const totalPay = netPay < 0n ? 0n : netPay;

  return {
    basePay,
    overtimePay,
    allowances,
    bonuses,
    deductions,
    adjustments,
    totalPay,
  };
}

export function calculateOvertimeHours({
  totalPaidHours,
  standardThresholdHours = 48,
}: {
  totalPaidHours: number;
  standardThresholdHours?: number;
}): { regularHours: number; overtimeHours: number } {
  if (totalPaidHours <= standardThresholdHours) {
    return {
      regularHours: totalPaidHours,
      overtimeHours: 0,
    };
  }

  return {
    regularHours: standardThresholdHours,
    overtimeHours: Number((totalPaidHours - standardThresholdHours).toFixed(2)),
  };
}

