import type { PayrollStatus } from "@prisma/client";

export interface PayrollItemDto {
  id: string;
  payrollPeriodId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  primaryPositionName: string;
  scheduledHours: number;
  workedHours: number;
  approvedHours: number;
  paidHours: number;
  overtimeHours: number;
  hourlyRateSnapshotVND: bigint;
  basePayVND: bigint;
  overtimePayVND: bigint;
  allowancesVND: bigint;
  bonusesVND: bigint;
  deductionsVND: bigint;
  adjustmentsVND: bigint;
  adjustmentReason: string | null;
  totalPayVND: bigint;
}

export interface PayrollPeriodSummaryDto {
  id: string;
  name: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  cutoffDate: string | null;
  paymentDate: string | null;
  status: PayrollStatus;
  overtimeMultiplier: number;
  totalEmployees: number;
  totalHours: number;
  totalPayrollVND: bigint;
  reviewedByName: string | null;
  reviewedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  lockedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PayrollPeriodDetailDto extends PayrollPeriodSummaryDto {
  items: PayrollItemDto[];
}

