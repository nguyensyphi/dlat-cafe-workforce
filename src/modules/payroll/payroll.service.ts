import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { formatIsoDateOnly, parseDateOnlyUtc } from "@/lib/date";
import {
  AppNotFoundError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import { parseOrThrow } from "@/lib/validation";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { calculateEmployeePayrollItem } from "./payroll-calculator";
import type {
  PayrollItemDto,
  PayrollPeriodDetailDto,
  PayrollPeriodSummaryDto,
} from "./payroll.types";
import {
  createPayrollPeriodSchema,
  transitionPayrollStatusSchema,
  updatePayrollItemSchema,
} from "./payroll.validation";

export class PayrollService {
  /**
   * Lists all payroll periods with aggregate summaries.
   */
  async listPeriods(actor: SessionUser): Promise<PayrollPeriodSummaryDto[]> {
    assertPermission(actor.role, "payroll:calculate");

    const periods = await prisma.payrollPeriod.findMany({
      orderBy: { periodStart: "desc" },
      include: {
        reviewedBy: {
          select: { email: true, employee: { select: { fullName: true } } },
        },
        approvedBy: {
          select: { email: true, employee: { select: { fullName: true } } },
        },
        items: {
          select: {
            paidHours: true,
            totalPay: true,
          },
        },
      },
    });

    return periods.map((p) => {
      let totalHours = 0;
      let totalPayrollVND = 0n;

      for (const item of p.items) {
        totalHours += Number(item.paidHours);
        totalPayrollVND += item.totalPay;
      }

      return {
        id: p.id,
        name: p.name,
        periodStart: formatIsoDateOnly(p.periodStart),
        periodEnd: formatIsoDateOnly(p.periodEnd),
        cutoffDate: p.cutoffDate ? formatIsoDateOnly(p.cutoffDate) : null,
        paymentDate: p.paymentDate ? formatIsoDateOnly(p.paymentDate) : null,
        status: p.status,
        overtimeMultiplier: Number(p.overtimeMultiplier),
        totalEmployees: p.items.length,
        totalHours: Number(totalHours.toFixed(2)),
        totalPayrollVND,
        reviewedByName:
          p.reviewedBy?.employee?.fullName ?? p.reviewedBy?.email ?? null,
        reviewedAt: p.reviewedAt?.toISOString() ?? null,
        approvedByName:
          p.approvedBy?.employee?.fullName ?? p.approvedBy?.email ?? null,
        approvedAt: p.approvedAt?.toISOString() ?? null,
        lockedAt: p.lockedAt?.toISOString() ?? null,
        notes: p.notes,
        createdAt: p.createdAt.toISOString(),
      };
    });
  }

  /**
   * Retrieves full details and all employee items for a specific payroll period.
   */
  async getPeriodDetail(
    actor: SessionUser,
    periodId: string,
  ): Promise<PayrollPeriodDetailDto> {
    assertPermission(actor.role, "payroll:calculate");

    const p = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        reviewedBy: {
          select: { email: true, employee: { select: { fullName: true } } },
        },
        approvedBy: {
          select: { email: true, employee: { select: { fullName: true } } },
        },
        items: {
          include: {
            employee: {
              select: {
                fullName: true,
                employeeCode: true,
                primaryPosition: { select: { name: true } },
              },
            },
          },
          orderBy: { employee: { employeeCode: "asc" } },
        },
      },
    });

    if (!p) {
      throw new AppNotFoundError("Không tìm thấy kỳ lương");
    }

    let totalHours = 0;
    let totalPayrollVND = 0n;

    const items: PayrollItemDto[] = p.items.map((item) => {
      const scheduled = Number(item.scheduledHours);
      const worked = Number(item.workedHours);
      const approved = Number(item.approvedHours);
      const paid = Number(item.paidHours);
      const ot = Number(item.overtimeHours);

      totalHours += paid;
      totalPayrollVND += item.totalPay;

      return {
        id: item.id,
        payrollPeriodId: item.payrollPeriodId,
        employeeId: item.employeeId,
        employeeName: item.employee.fullName,
        employeeCode: item.employee.employeeCode,
        primaryPositionName: item.employee.primaryPosition.name,
        scheduledHours: scheduled,
        workedHours: worked,
        approvedHours: approved,
        paidHours: paid,
        overtimeHours: ot,
        hourlyRateSnapshotVND: item.hourlyRateSnapshot,
        basePayVND: item.basePay,
        overtimePayVND: item.overtimePay,
        allowancesVND: item.allowances,
        bonusesVND: item.bonuses,
        deductionsVND: item.deductions,
        adjustmentsVND: item.adjustments,
        adjustmentReason: item.adjustmentReason,
        totalPayVND: item.totalPay,
      };
    });

    return {
      id: p.id,
      name: p.name,
      periodStart: formatIsoDateOnly(p.periodStart),
      periodEnd: formatIsoDateOnly(p.periodEnd),
      cutoffDate: p.cutoffDate ? formatIsoDateOnly(p.cutoffDate) : null,
      paymentDate: p.paymentDate ? formatIsoDateOnly(p.paymentDate) : null,
      status: p.status,
      overtimeMultiplier: Number(p.overtimeMultiplier),
      totalEmployees: items.length,
      totalHours: Number(totalHours.toFixed(2)),
      totalPayrollVND,
      reviewedByName:
        p.reviewedBy?.employee?.fullName ?? p.reviewedBy?.email ?? null,
      reviewedAt: p.reviewedAt?.toISOString() ?? null,
      approvedByName:
        p.approvedBy?.employee?.fullName ?? p.approvedBy?.email ?? null,
      approvedAt: p.approvedAt?.toISOString() ?? null,
      lockedAt: p.lockedAt?.toISOString() ?? null,
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
      items,
    };
  }

  /**
   * Creates a new payroll period in DRAFT status.
   */
  async createPeriod(
    actor: SessionUser,
    rawInput: unknown,
  ): Promise<PayrollPeriodSummaryDto> {
    assertPermission(actor.role, "payroll:calculate");

    const input = parseOrThrow(
      createPayrollPeriodSchema,
      rawInput,
    );

    const periodStart = parseDateOnlyUtc(input.periodStart);
    const periodEnd = parseDateOnlyUtc(input.periodEnd);

    // Check duplicate or overlapping date range (Rule 8: Two payroll periods must not overlap and double-count hours)
    const overlapping = await prisma.payrollPeriod.findFirst({
      where: {
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
      select: { id: true, name: true, periodStart: true, periodEnd: true },
    });

    if (overlapping) {
      throw new AppValidationError(
        `Khoảng thời gian từ ${input.periodStart} đến ${input.periodEnd} bị trùng lặp với kỳ lương "${overlapping.name}" (${formatIsoDateOnly(overlapping.periodStart)} – ${formatIsoDateOnly(overlapping.periodEnd)}). Hai kỳ lương không được giao nhau để tránh tính trùng giờ công.`,
      );
    }

    const created = await prisma.payrollPeriod.create({
      data: {
        name: input.name,
        periodStart,
        periodEnd,
        cutoffDate: input.cutoffDate ? parseDateOnlyUtc(input.cutoffDate) : null,
        paymentDate: input.paymentDate
          ? parseDateOnlyUtc(input.paymentDate)
          : null,
        overtimeMultiplier: input.overtimeMultiplier,
        notes: input.notes,
        status: "DRAFT",
      },
    });

    await recordAuditLog({
      userId: actor.userId,
      action: "PAYROLL_PERIOD_CREATED",
      entityType: "PayrollPeriod",
      entityId: created.id,
      newValues: {
        name: created.name,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    });

    return {
      id: created.id,
      name: created.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      cutoffDate: input.cutoffDate ?? null,
      paymentDate: input.paymentDate ?? null,
      status: created.status,
      overtimeMultiplier: Number(created.overtimeMultiplier),
      totalEmployees: 0,
      totalHours: 0,
      totalPayrollVND: 0n,
      reviewedByName: null,
      reviewedAt: null,
      approvedByName: null,
      approvedAt: null,
      lockedAt: null,
      notes: created.notes,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Calculates payroll items for all employees from actual attendance records.
   * Pulls approved/paid hours, snapshots historical wage rates, applies overtime.
   */
  async calculatePeriod(
    actor: SessionUser,
    periodId: string,
  ): Promise<PayrollPeriodDetailDto> {
    assertPermission(actor.role, "payroll:calculate");

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        items: true,
      },
    });

    if (!period) {
      throw new AppNotFoundError("Không tìm thấy kỳ lương");
    }

    if (period.status === "LOCKED" || period.status === "PAID") {
      throw new AppValidationError(
        "Kỳ lương đã khóa hoặc đã thanh toán, không thể tính toán lại.",
      );
    }

    // 1. Fetch all non-rejected attendance records in the date range
    const attendances = await prisma.attendance.findMany({
      where: {
        status: { not: "REJECTED" },
        workDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
      include: {
        employee: {
          include: {
            primaryPosition: true,
            payRates: {
              where: {
                effectiveFrom: { lte: period.periodEnd },
              },
              orderBy: { effectiveFrom: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    // 2. Fetch all active employees to ensure every employee is accounted for
    const activeEmployees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      include: {
        primaryPosition: true,
        payRates: {
          where: {
            effectiveFrom: { lte: period.periodEnd },
          },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });

    // Aggregate by employeeId
    const employeeMap = new Map<
      string,
      {
        employee: (typeof activeEmployees)[number];
        scheduledMinutes: number;
        workedMinutes: number;
        approvedMinutes: number;
        paidMinutes: number;
        approvedOvertimeMinutes: number;
      }
    >();

    // Seed active employees
    for (const emp of activeEmployees) {
      employeeMap.set(emp.id, {
        employee: emp,
        scheduledMinutes: 0,
        workedMinutes: 0,
        approvedMinutes: 0,
        paidMinutes: 0,
        approvedOvertimeMinutes: 0,
      });
    }

    // Aggregate attendance hours
    for (const att of attendances) {
      let entry = employeeMap.get(att.employeeId);
      if (!entry) {
        entry = {
          employee: att.employee,
          scheduledMinutes: 0,
          workedMinutes: 0,
          approvedMinutes: 0,
          paidMinutes: 0,
          approvedOvertimeMinutes: 0,
        };
        employeeMap.set(att.employeeId, entry);
      }

      entry.scheduledMinutes += att.scheduledMinutes;
      entry.workedMinutes += att.workedMinutes;
      entry.approvedMinutes += att.approvedMinutes ?? att.workedMinutes;
      // If paidMinutes is not explicitly set, use approvedMinutes or workedMinutes
      entry.paidMinutes +=
        att.paidMinutes ?? att.approvedMinutes ?? att.workedMinutes;
      // PRD 6.4: only manager-approved OT goes into OT pay
      if (att.overtimeStatus === "APPROVED") {
        entry.approvedOvertimeMinutes += att.overtimeMinutes;
      }
    }

    // Existing items map to preserve existing allowances/bonuses/deductions
    const existingItemsMap = new Map(
      period.items.map((i) => [i.employeeId, i]),
    );

    // 3. Compute calculations inside transaction
    await prisma.$transaction(async (tx) => {
      for (const [employeeId, data] of employeeMap.entries()) {
        const scheduledHours = Number(
          (data.scheduledMinutes / 60).toFixed(2),
        );
        const workedHours = Number((data.workedMinutes / 60).toFixed(2));
        const approvedHours = Number((data.approvedMinutes / 60).toFixed(2));
        const totalPaidHours = Number((data.paidMinutes / 60).toFixed(2));

        // Effective wage snapshot
        const rate = data.employee.payRates[0];
        const hourlyRateSnapshot = rate ? rate.hourlyRate : 0n;

        // Overtime: PRD 6.4 – only per-shift OT approved by a manager.
        // Regular paid hours come from shift-window payable minutes (already exclude OT).
        const regularHours = totalPaidHours;
        const overtimeHours = Number(
          (data.approvedOvertimeMinutes / 60).toFixed(2),
        );
        // Stored paidHours keeps the existing convention: regular + OT
        const paidHoursIncludingOt = Number(
          (regularHours + overtimeHours).toFixed(2),
        );

        // Retain existing manual additions if already entered
        const existing = existingItemsMap.get(employeeId);
        const allowances = existing?.allowances ?? 0n;
        const bonuses = existing?.bonuses ?? 0n;
        const deductions = existing?.deductions ?? 0n;
        const adjustments = existing?.adjustments ?? 0n;
        const adjustmentReason = existing?.adjustmentReason ?? null;

        const calc = calculateEmployeePayrollItem({
          paidHours: regularHours,
          hourlyRateSnapshot,
          overtimeHours,
          overtimeMultiplier: Number(period.overtimeMultiplier),
          allowances,
          bonuses,
          deductions,
          adjustments,
        });

        await tx.payrollItem.upsert({
          where: {
            payrollPeriodId_employeeId: {
              payrollPeriodId: period.id,
              employeeId,
            },
          },
          create: {
            payrollPeriodId: period.id,
            employeeId,
            scheduledHours: new Prisma.Decimal(scheduledHours),
            workedHours: new Prisma.Decimal(workedHours),
            approvedHours: new Prisma.Decimal(approvedHours),
            paidHours: new Prisma.Decimal(paidHoursIncludingOt),
            overtimeHours: new Prisma.Decimal(overtimeHours),
            hourlyRateSnapshot,
            basePay: calc.basePay,
            overtimePay: calc.overtimePay,
            allowances: calc.allowances,
            bonuses: calc.bonuses,
            deductions: calc.deductions,
            adjustments: calc.adjustments,
            adjustmentReason,
            totalPay: calc.totalPay,
          },
          update: {
            scheduledHours: new Prisma.Decimal(scheduledHours),
            workedHours: new Prisma.Decimal(workedHours),
            approvedHours: new Prisma.Decimal(approvedHours),
            paidHours: new Prisma.Decimal(paidHoursIncludingOt),
            overtimeHours: new Prisma.Decimal(overtimeHours),
            hourlyRateSnapshot,
            basePay: calc.basePay,
            overtimePay: calc.overtimePay,
            totalPay: calc.totalPay,
          },
        });
      }

      await tx.payrollPeriod.update({
        where: { id: period.id },
        data: {
          status: "CALCULATED",
        },
      });

      await recordAuditLog({
        userId: actor.userId,
        action: "PAYROLL_CALCULATED",
        entityType: "PayrollPeriod",
        entityId: period.id,
        newValues: {
          totalEmployees: employeeMap.size,
          calculatedAt: new Date().toISOString(),
        },
      });
    });

    return this.getPeriodDetail(actor, period.id);
  }

  /**
   * Updates an individual employee's payroll item (allowance, bonus, deduction, adjustment).
   * Requires mandatory reason and logs an audit trail.
   */
  async updatePayrollItem(
    actor: SessionUser,
    itemId: string,
    rawInput: unknown,
  ): Promise<PayrollItemDto> {
    assertPermission(actor.role, "payroll:calculate");

    const input = parseOrThrow(
      updatePayrollItemSchema,
      rawInput,
    );

    const item = await prisma.payrollItem.findUnique({
      where: { id: itemId },
      include: {
        payrollPeriod: true,
        employee: {
          select: {
            fullName: true,
            employeeCode: true,
            primaryPosition: { select: { name: true } },
          },
        },
      },
    });

    if (!item) {
      throw new AppNotFoundError("Không tìm thấy mục lương");
    }

    if (
      item.payrollPeriod.status === "LOCKED" ||
      item.payrollPeriod.status === "PAID"
    ) {
      throw new AppValidationError(
        "Kỳ lương đã thanh toán hoặc đã khóa, không thể chỉnh sửa mục lương.",
      );
    }

    const allowances = BigInt(input.allowances);
    const bonuses = BigInt(input.bonuses);
    const deductions = BigInt(input.deductions);
    const adjustments = BigInt(input.adjustments);

    const calc = calculateEmployeePayrollItem({
      paidHours: Number(item.paidHours) - Number(item.overtimeHours),
      hourlyRateSnapshot: item.hourlyRateSnapshot,
      overtimeHours: Number(item.overtimeHours),
      overtimeMultiplier: Number(item.payrollPeriod.overtimeMultiplier),
      allowances,
      bonuses,
      deductions,
      adjustments,
    });

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.payrollItem.update({
        where: { id: itemId },
        data: {
          allowances,
          bonuses,
          deductions,
          adjustments,
          adjustmentReason: input.adjustmentReason,
          totalPay: calc.totalPay,
        },
        include: {
          employee: {
            select: {
              fullName: true,
              employeeCode: true,
              primaryPosition: { select: { name: true } },
            },
          },
        },
      });

      await recordAuditLog({
        userId: actor.userId,
        action: "PAYROLL_ITEM_UPDATED",
        entityType: "PayrollItem",
        entityId: itemId,
        oldValues: {
          totalPay: item.totalPay.toString(),
          allowances: item.allowances.toString(),
          bonuses: item.bonuses.toString(),
          deductions: item.deductions.toString(),
          adjustments: item.adjustments.toString(),
        },
        newValues: {
          totalPay: calc.totalPay.toString(),
          allowances: allowances.toString(),
          bonuses: bonuses.toString(),
          deductions: deductions.toString(),
          adjustments: adjustments.toString(),
          adjustmentReason: input.adjustmentReason,
        },
        reason: input.adjustmentReason,
      });

      return row;
    });

    return {
      id: updated.id,
      payrollPeriodId: updated.payrollPeriodId,
      employeeId: updated.employeeId,
      employeeName: updated.employee.fullName,
      employeeCode: updated.employee.employeeCode,
      primaryPositionName: updated.employee.primaryPosition.name,
      scheduledHours: Number(updated.scheduledHours),
      workedHours: Number(updated.workedHours),
      approvedHours: Number(updated.approvedHours),
      paidHours: Number(updated.paidHours),
      overtimeHours: Number(updated.overtimeHours),
      hourlyRateSnapshotVND: updated.hourlyRateSnapshot,
      basePayVND: updated.basePay,
      overtimePayVND: updated.overtimePay,
      allowancesVND: updated.allowances,
      bonusesVND: updated.bonuses,
      deductionsVND: updated.deductions,
      adjustmentsVND: updated.adjustments,
      adjustmentReason: updated.adjustmentReason,
      totalPayVND: updated.totalPay,
    };
  }

  /**
   * Transitions a payroll period across its lifecycle:
   * DRAFT -> CALCULATED -> REVIEWED -> APPROVED -> PAID -> LOCKED.
   */
  async transitionPeriodStatus(
    actor: SessionUser,
    periodId: string,
    rawInput: unknown,
  ): Promise<PayrollPeriodDetailDto> {
    const input = parseOrThrow(
      transitionPayrollStatusSchema,
      rawInput,
    );

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      throw new AppNotFoundError("Không tìm thấy kỳ lương");
    }

    if (period.status === "LOCKED") {
      throw new AppValidationError("Kỳ lương đã bị KHÓA VĨNH VIỄN.");
    }

    // Role gate: Only OWNER can approve, pay, or lock payroll
    if (
      input.targetStatus === "APPROVED" ||
      input.targetStatus === "PAID" ||
      input.targetStatus === "LOCKED"
    ) {
      assertPermission(actor.role, "payroll:approve");
    } else {
      assertPermission(actor.role, "payroll:calculate");
    }

    const now = new Date();
    const updateData: Prisma.PayrollPeriodUpdateInput = {
      status: input.targetStatus,
      ...(input.notes ? { notes: input.notes } : {}),
    };

    if (input.targetStatus === "REVIEWED") {
      updateData.reviewedBy = { connect: { id: actor.userId } };
      updateData.reviewedAt = now;
    } else if (input.targetStatus === "APPROVED") {
      updateData.approvedBy = { connect: { id: actor.userId } };
      updateData.approvedAt = now;
    } else if (input.targetStatus === "PAID") {
      updateData.paymentDate = now;
    } else if (input.targetStatus === "LOCKED") {
      updateData.lockedAt = now;
    }

    await prisma.$transaction(async (tx) => {
      await tx.payrollPeriod.update({
        where: { id: periodId },
        data: updateData,
      });

      await recordAuditLog({
        userId: actor.userId,
        action: `PAYROLL_STATUS_${input.targetStatus}`,
        entityType: "PayrollPeriod",
        entityId: periodId,
        oldValues: { status: period.status },
        newValues: { status: input.targetStatus },
        reason: input.notes,
      });
    });

    return this.getPeriodDetail(actor, periodId);
  }

  /**
   * Employee self-service view: lists approved/paid/locked items for the current employee.
   */
  async getMyPayrollHistory(actor: SessionUser): Promise<
    Array<{
      id: string;
      periodName: string;
      periodStart: string;
      periodEnd: string;
      paymentDate: string | null;
      employeeCode: string;
      fullName: string;
      positionName: string;
      paidHours: number;
      hourlyRateVND: bigint;
      basePayVND: bigint;
      overtimePayVND: bigint;
      allowancesVND: bigint;
      bonusesVND: bigint;
      deductionsVND: bigint;
      adjustmentsVND: bigint;
      adjustmentReason: string | null;
      totalPayVND: bigint;
      status: string;
    }>
  > {
    assertPermission(actor.role, "self:payroll");

    if (!actor.employeeId) {
      return [];
    }

    const items = await prisma.payrollItem.findMany({
      where: {
        employeeId: actor.employeeId,
        payrollPeriod: {
          status: { in: ["APPROVED", "PAID", "LOCKED"] },
        },
      },
      orderBy: { payrollPeriod: { periodStart: "desc" } },
      include: {
        payrollPeriod: true,
        employee: {
          include: {
            primaryPosition: true,
          },
        },
      },
    });

    return items.map((i) => ({
      id: i.id,
      periodName: i.payrollPeriod.name,
      periodStart: formatIsoDateOnly(i.payrollPeriod.periodStart),
      periodEnd: formatIsoDateOnly(i.payrollPeriod.periodEnd),
      paymentDate: i.payrollPeriod.paymentDate
        ? formatIsoDateOnly(i.payrollPeriod.paymentDate)
        : null,
      employeeCode: i.employee.employeeCode,
      fullName: i.employee.fullName,
      positionName: i.employee.primaryPosition?.name ?? "Nhân viên",
      paidHours: Number(i.paidHours),
      hourlyRateVND: i.hourlyRateSnapshot,
      basePayVND: i.basePay,
      overtimePayVND: i.overtimePay,
      allowancesVND: i.allowances,
      bonusesVND: i.bonuses,
      deductionsVND: i.deductions,
      adjustmentsVND: i.adjustments,
      adjustmentReason: i.adjustmentReason,
      totalPayVND: i.totalPay,
      status: i.payrollPeriod.status,
    }));
  }
}

export const payrollService = new PayrollService();
