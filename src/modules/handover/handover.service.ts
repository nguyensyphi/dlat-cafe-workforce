import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  assertPermission,
  AppError,
  AppNotFoundError,
  AppValidationError,
} from "@/lib/permissions";
import {
  calculateCashReconciliation,
  validateHandoverSubmission,
  type HandoverSubmissionInput,
} from "./handover-calculator";
import { HandoverStatus, Prisma } from "@prisma/client";

export const handoverService = {
  /**
   * Lấy phiếu bàn giao của một ca làm việc
   */
  async getByShiftId(shiftId: string, actor: SessionUser) {
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        template: true,
        assignments: {
          include: {
            employee: true,
            position: true,
          },
        },
      },
    });

    if (!shift) {
      throw new AppNotFoundError("Không tìm thấy ca làm việc.");
    }

    const handover = await prisma.shiftHandover.findFirst({
      where: { shiftId },
      include: {
        handoverEmployee: true,
        receivingEmployee: true,
        reviewerUser: { select: { email: true, role: true } },
      },
    });

    return {
      shift,
      handover,
    };
  },

  /**
   * Nộp biên bản bàn giao ca (8 nhóm nội dung)
   */
  async submitHandover(input: HandoverSubmissionInput, actor: SessionUser) {
    const validation = validateHandoverSubmission(input);
    if (!validation.isValid) {
      throw new AppValidationError(
        "Dữ liệu bàn giao không hợp lệ: " + validation.errors.join("; "),
      );
    }

    const shift = await prisma.shift.findUnique({
      where: { id: input.shiftId },
    });
    if (!shift) {
      throw new AppNotFoundError("Không tìm thấy ca làm việc.");
    }

    const recon = calculateCashReconciliation(input.reconciliation);
    const status: HandoverStatus = recon.hasDiscrepancy
      ? HandoverStatus.DISCREPANCY
      : HandoverStatus.SUBMITTED;

    const existing = await prisma.shiftHandover.findFirst({
      where: { shiftId: input.shiftId },
    });

    const data: Prisma.ShiftHandoverCreateInput = {
      shift: { connect: { id: input.shiftId } },
      handoverEmployee: { connect: { id: input.handoverEmployeeId } },
      receivingEmployee: input.receivingEmployeeId
        ? { connect: { id: input.receivingEmployeeId } }
        : undefined,
      status,
      submittedAt: new Date(),
      openingCashVnd: BigInt(Math.round(Number(input.reconciliation.openingCashVnd ?? 0))),
      cashSalesVnd: BigInt(Math.round(Number(input.reconciliation.cashSalesVnd ?? 0))),
      cashExpensesVnd: BigInt(Math.round(Number(input.reconciliation.cashExpensesVnd ?? 0))),
      expectedClosingCashVnd: recon.expectedClosingCashVnd,
      actualClosingCashVnd: BigInt(Math.round(Number(input.reconciliation.actualClosingCashVnd ?? 0))),
      cashDifferenceVnd: recon.cashDifferenceVnd,
      cashDiscrepancyReason: input.cashDiscrepancyReason ?? null,
      stockReport: input.inventory as unknown as Prisma.InputJsonValue,
      equipmentReport: input.equipment as unknown as Prisma.InputJsonValue,
      cleanlinessReport: input.cleanliness as unknown as Prisma.InputJsonValue,
      customerNotes: input.customerNotes ?? null,
      pendingTasks: (input.pendingTasks ?? []) as unknown as Prisma.InputJsonValue,
      handoverNotes: input.handoverNotes ?? null,
    };

    let result;
    if (existing) {
      result = await prisma.shiftHandover.update({
        where: { id: existing.id },
        data: {
          ...data,
          shift: undefined,
        },
        include: {
          handoverEmployee: true,
          receivingEmployee: true,
        },
      });
    } else {
      result = await prisma.shiftHandover.create({
        data,
        include: {
          handoverEmployee: true,
          receivingEmployee: true,
        },
      });
    }

    // Ghi audit log
    await prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: existing ? "UPDATE_SHIFT_HANDOVER" : "SUBMIT_SHIFT_HANDOVER",
        entityType: "ShiftHandover",
        entityId: result.id,
        newValues: {
          status: result.status,
          cashDifferenceVnd: result.cashDifferenceVnd.toString(),
        },
      },
    });

    return result;
  },

  /**
   * Quản lý / Thu ngân xác nhận phiếu bàn giao
   */
  async confirmHandover(
    handoverId: string,
    reviewNotes: string | undefined,
    actor: SessionUser,
  ) {
    assertPermission(actor.role, "attendance:manage");

    const handover = await prisma.shiftHandover.findUnique({
      where: { id: handoverId },
    });
    if (!handover) {
      throw new AppNotFoundError("Không tìm thấy phiếu bàn giao ca.");
    }

    const updated = await prisma.shiftHandover.update({
      where: { id: handoverId },
      data: {
        status: HandoverStatus.CONFIRMED,
        confirmedAt: new Date(),
        reviewerUserId: actor.userId,
        reviewNotes: reviewNotes ?? null,
      },
      include: {
        handoverEmployee: true,
        receivingEmployee: true,
        reviewerUser: { select: { email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: "CONFIRM_SHIFT_HANDOVER",
        entityType: "ShiftHandover",
        entityId: handoverId,
        newValues: { status: HandoverStatus.CONFIRMED, reviewNotes },
      },
    });

    return updated;
  },

  /**
   * Người nhận ca tiếp theo ký nhận / tiếp quản
   */
  async receiveHandover(
    handoverId: string,
    receivingEmployeeId: string,
    notes: string | undefined,
    actor: SessionUser,
  ) {
    const handover = await prisma.shiftHandover.findUnique({
      where: { id: handoverId },
    });
    if (!handover) {
      throw new AppNotFoundError("Không tìm thấy phiếu bàn giao ca.");
    }

    const updated = await prisma.shiftHandover.update({
      where: { id: handoverId },
      data: {
        receivingEmployeeId,
        handoverNotes: notes
          ? handover.handoverNotes
            ? `${handover.handoverNotes}\n[Người nhận ghi chú]: ${notes}`
            : notes
          : handover.handoverNotes,
      },
      include: {
        handoverEmployee: true,
        receivingEmployee: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: "RECEIVE_SHIFT_HANDOVER",
        entityType: "ShiftHandover",
        entityId: handoverId,
        newValues: { receivingEmployeeId, notes },
      },
    });

    return updated;
  },

  /**
   * Ghi nhận sai lệch / tranh chấp bàn giao
   */
  async disputeHandover(
    handoverId: string,
    disputeReason: string,
    actor: SessionUser,
  ) {
    if (!disputeReason || disputeReason.trim().length < 5) {
      throw new AppValidationError("Lý do sai lệch phải có ít nhất 5 ký tự.");
    }

    const handover = await prisma.shiftHandover.findUnique({
      where: { id: handoverId },
    });
    if (!handover) {
      throw new AppNotFoundError("Không tìm thấy phiếu bàn giao ca.");
    }

    const updated = await prisma.shiftHandover.update({
      where: { id: handoverId },
      data: {
        status: HandoverStatus.DISCREPANCY,
        cashDiscrepancyReason: handover.cashDiscrepancyReason
          ? `${handover.cashDiscrepancyReason}\n[Tranh chấp]: ${disputeReason}`
          : disputeReason,
      },
      include: {
        handoverEmployee: true,
        receivingEmployee: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: "DISPUTE_SHIFT_HANDOVER",
        entityType: "ShiftHandover",
        entityId: handoverId,
        newValues: { status: HandoverStatus.DISCREPANCY, disputeReason },
      },
    });

    return updated;
  },

  /**
   * Quản lý mở lại phiếu bàn giao đã duyệt để chỉnh sửa
   */
  async reopenHandover(
    handoverId: string,
    reopenReason: string,
    actor: SessionUser,
  ) {
    assertPermission(actor.role, "attendance:manage");

    if (!reopenReason || reopenReason.trim().length < 5) {
      throw new AppValidationError("Lý do mở lại phải có ít nhất 5 ký tự.");
    }

    const handover = await prisma.shiftHandover.findUnique({
      where: { id: handoverId },
    });
    if (!handover) {
      throw new AppNotFoundError("Không tìm thấy phiếu bàn giao ca.");
    }

    const updated = await prisma.shiftHandover.update({
      where: { id: handoverId },
      data: {
        status: HandoverStatus.SUBMITTED,
        reviewNotes: handover.reviewNotes
          ? `${handover.reviewNotes}\n[Mở lại]: ${reopenReason}`
          : `[Mở lại]: ${reopenReason}`,
      },
      include: {
        handoverEmployee: true,
        receivingEmployee: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: "REOPEN_SHIFT_HANDOVER",
        entityType: "ShiftHandover",
        entityId: handoverId,
        newValues: { status: HandoverStatus.SUBMITTED, reopenReason },
      },
    });

    return updated;
  },

  /**
   * Danh sách phiếu bàn giao theo bộ lọc ngày / trạng thái
   */
  async listHandovers(
    filters: {
      workDate?: Date;
      status?: HandoverStatus;
      take?: number;
    },
    actor: SessionUser,
  ) {
    assertPermission(actor.role, "attendance:manage");

    return prisma.shiftHandover.findMany({
      where: {
        status: filters.status,
        shift: filters.workDate ? { workDate: filters.workDate } : undefined,
      },
      include: {
        shift: {
          include: { template: true },
        },
        handoverEmployee: true,
        receivingEmployee: true,
        reviewerUser: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: filters.take ?? 50,
    });
  },
};
