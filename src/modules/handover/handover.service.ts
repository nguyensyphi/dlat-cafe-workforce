import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  assertPermission,
  AppNotFoundError,
  AppValidationError,
} from "@/lib/permissions";
import {
  calculateCashReconciliation,
  validateHandoverSubmission,
  type HandoverSubmissionInput,
} from "./handover-calculator";
import { HandoverStatus, Prisma, ScheduleStatus } from "@prisma/client";
import {
  createNotifications,
  dispatchNotificationsToUsers,
} from "@/modules/notifications/notification.service";
import {
  loadSettingsBundle,
  shouldNotifyCashDiscrepancy,
} from "@/modules/settings/settings.service";
import { invalidateDashboardCache } from "@/modules/dashboard/dashboard.service";

function isSessionUser(value: unknown): value is SessionUser {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    "userId" in (value as Record<string, unknown>) &&
    "role" in (value as Record<string, unknown>)
  );
}

function formatCashDiffLabel(diffVnd: bigint): string {
  const abs = diffVnd < 0n ? -diffVnd : diffVnd;
  const formatted = new Intl.NumberFormat("vi-VN").format(Number(abs));
  return diffVnd < 0n ? `Thiếu ${formatted}đ` : `Dư ${formatted}đ`;
}

async function runInTransactionOrDirect<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (typeof prisma.$transaction === "function") {
    return prisma.$transaction(fn);
  }
  return fn(prisma as unknown as Prisma.TransactionClient);
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getTodayDateStrVN(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getMondayDateUTC(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

async function resolveShiftForHandover(input: HandoverSubmissionInput) {
  const shiftInclude = {
    assignments: {
      where: { status: "ASSIGNED" as const },
      include: { position: { select: { code: true } } },
    },
  };

  if (input.shiftId !== "shift-today-fallback") {
    if (!UUID_REGEX.test(input.shiftId)) {
      throw new AppValidationError("Mã ca làm việc không hợp lệ.");
    }
    return prisma.shift.findUnique({
      where: { id: input.shiftId },
      include: shiftInclude,
    });
  }

  const workDateStr = input.fallbackShift?.workDate || getTodayDateStrVN();
  const templateCode = input.fallbackShift?.templateCode || "CA_1";
  const workDate = new Date(`${workDateStr}T00:00:00.000Z`);

  const template = await prisma.shiftTemplate.findFirst({
    where: { code: templateCode },
  });

  const existingShift = await prisma.shift.findFirst({
    where: {
      workDate,
      status: { not: "CANCELLED" },
      ...(template ? { templateId: template.id } : {}),
    },
    include: shiftInclude,
    orderBy: { startAt: "asc" },
  });

  if (existingShift) {
    return existingShift;
  }

  const weekStart = getMondayDateUTC(workDateStr);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  let schedule = await prisma.schedule.findUnique({
    where: { weekStart },
  });
  if (!schedule) {
    schedule = await prisma.schedule.create({
      data: {
        weekStart,
        name: `Lịch tuần ${weekStartStr}`,
        status: ScheduleStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
  }

  const startTime = template?.startTime ?? "07:00";
  const endTime = template?.endTime ?? "11:00";
  const startAt = new Date(`${workDateStr}T${startTime}:00+07:00`);
  const endAt = new Date(`${workDateStr}T${endTime}:00+07:00`);

  return prisma.shift.create({
    data: {
      scheduleId: schedule.id,
      templateId: template?.id ?? null,
      name: template?.name ?? "Ca 1 (07:00–11:00)",
      workDate,
      startAt,
      endAt,
      requiredStaff: template?.minStaff ?? 1,
      maxStaff: template?.maxStaff ?? 2,
      notes: "Ca phát sinh tự động khi nhân viên nộp biên bản bàn giao",
    },
    include: shiftInclude,
  });
}

export const handoverService = {
  /**
   * Lấy phiếu bàn giao của một ca làm việc
   */
  async getByShiftId(shiftId: string) {
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
   * Hỗ trợ cả (input, actor) và (actor, input)
   */
  async submitHandover(
    firstArg: HandoverSubmissionInput | SessionUser,
    secondArg: SessionUser | HandoverSubmissionInput,
  ) {
    const actor = isSessionUser(firstArg)
      ? firstArg
      : (secondArg as SessionUser);
    const input = (
      isSessionUser(firstArg) ? secondArg : firstArg
    ) as HandoverSubmissionInput;

    const validation = validateHandoverSubmission(input);
    if (!validation.isValid) {
      throw new AppValidationError(
        "Dữ liệu bàn giao không hợp lệ: " + validation.errors.join("; "),
      );
    }

    if (
      input.receivingEmployeeId &&
      input.receivingEmployeeId === input.handoverEmployeeId
    ) {
      throw new AppValidationError(
        "Người giao ca và người nhận bàn giao không thể là cùng một nhân viên.",
      );
    }

    const shift = await resolveShiftForHandover(input);
    if (!shift) {
      throw new AppNotFoundError("Không tìm thấy ca làm việc.");
    }
    const resolvedShiftId = shift.id;

    const settingsBundle = await loadSettingsBundle();
    const recon = calculateCashReconciliation(input.reconciliation);
    const status: HandoverStatus = recon.hasDiscrepancy
      ? HandoverStatus.DISCREPANCY
      : HandoverStatus.SUBMITTED;
    const notifyDiscrepancy = shouldNotifyCashDiscrepancy(
      recon.cashDifferenceVnd,
      settingsBundle.notificationPolicy,
    );

    const existing = await prisma.shiftHandover.findFirst({
      where: { shiftId: resolvedShiftId },
    });

    if (existing && existing.status === HandoverStatus.CONFIRMED) {
      throw new AppValidationError(
        "Phiếu bàn giao ca này đã được xác nhận và khóa sổ, cần Quản lý mở lại trước khi chỉnh sửa.",
      );
    }

    const data: Prisma.ShiftHandoverCreateInput = {
      shift: { connect: { id: resolvedShiftId } },
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

    const txResult = await runInTransactionOrDirect(async (tx) => {
      const saved = existing
        ? await tx.shiftHandover.update({
            where: { id: existing.id },
            data: {
              ...data,
              shift: undefined,
            },
            include: {
              handoverEmployee: true,
              receivingEmployee: true,
            },
          })
        : await tx.shiftHandover.create({
            data,
            include: {
              handoverEmployee: true,
              receivingEmployee: true,
            },
          });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: existing ? "UPDATE_SHIFT_HANDOVER" : "SUBMIT_SHIFT_HANDOVER",
          entityType: "ShiftHandover",
          entityId: saved.id,
          newValues: {
            status: saved.status,
            cashDifferenceVnd: saved.cashDifferenceVnd.toString(),
          },
        },
      });

      let managerUserIds: string[] = [];
      let alertTitle = "";
      let alertMessage = "";

      if (notifyDiscrepancy && typeof tx.user?.findMany === "function") {
        const managers = await tx.user.findMany({
          where: { role: { in: ["OWNER", "MANAGER"] }, isActive: true },
          select: { id: true },
        });
        managerUserIds = managers.map((m) => m.id);
        const diffLabel = formatCashDiffLabel(recon.cashDifferenceVnd);
        const empName = saved.handoverEmployee?.fullName ?? actor.fullName;
        alertTitle = "Cảnh báo chênh lệch tiền két bàn giao ca";
        alertMessage = `Biên bản bàn giao ca ${shift.name} của ${empName} phát hiện chênh lệch tiền két (lệch két: ${diffLabel}). Lý do: ${saved.cashDiscrepancyReason || "Chưa ghi rõ"}.`;

        if (managerUserIds.length > 0) {
          await createNotifications(
            tx,
            managerUserIds.map((userId) => ({
              userId,
              type: "SYSTEM_ALERT" as const,
              title: alertTitle,
              message: alertMessage,
              linkUrl: "/handovers",
            })),
          );
        }
      }

      return {
        saved,
        managerUserIds,
        alertTitle,
        alertMessage,
      };
    });

    if (notifyDiscrepancy && txResult.managerUserIds.length > 0) {
      await dispatchNotificationsToUsers(txResult.managerUserIds, {
        eventType: "HANDOVER_DISCREPANCY",
        title: txResult.alertTitle,
        message: txResult.alertMessage,
        linkUrl: "/handovers",
        severity: "urgent",
        includeManagers: true,
        includeGroupTelegram: true,
      });
    }

    invalidateDashboardCache();
    return txResult.saved;
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

    invalidateDashboardCache();
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

    if (handover.handoverEmployeeId === receivingEmployeeId) {
      throw new AppValidationError(
        "Người nhận bàn giao ca không được trùng với người giao ca.",
      );
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
   * Hỗ trợ cả (handoverId, disputeReason, actor) và (actor, handoverId, rawInput)
   */
  async disputeHandover(
    firstArg: string | SessionUser,
    secondArg: string,
    thirdArg: SessionUser | string | { disputeReason?: string },
  ) {
    let handoverId: string;
    let disputeReason: string;
    let actor: SessionUser;

    if (isSessionUser(firstArg)) {
      actor = firstArg;
      handoverId = secondArg;
      disputeReason =
        typeof thirdArg === "string"
          ? thirdArg
          : (thirdArg as { disputeReason?: string })?.disputeReason ?? "";
    } else {
      handoverId = firstArg;
      disputeReason = secondArg;
      actor = thirdArg as SessionUser;
    }

    if (!disputeReason || disputeReason.trim().length < 5) {
      throw new AppValidationError("Lý do sai lệch phải có ít nhất 5 ký tự.");
    }

    const handover = await prisma.shiftHandover.findUnique({
      where: { id: handoverId },
      include: { shift: true },
    });
    if (!handover) {
      throw new AppNotFoundError("Không tìm thấy phiếu bàn giao ca.");
    }

    const trimmedReason = disputeReason.trim();
    const txResult = await runInTransactionOrDirect(async (tx) => {
      const updated = await tx.shiftHandover.update({
        where: { id: handoverId },
        data: {
          status: HandoverStatus.DISCREPANCY,
          cashDiscrepancyReason: handover.cashDiscrepancyReason
            ? `${handover.cashDiscrepancyReason}\n[Tranh chấp]: ${trimmedReason}`
            : trimmedReason,
        },
        include: {
          handoverEmployee: true,
          receivingEmployee: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: "DISPUTE_SHIFT_HANDOVER",
          entityType: "ShiftHandover",
          entityId: handoverId,
          newValues: { status: HandoverStatus.DISCREPANCY, disputeReason: trimmedReason },
        },
      });

      const managers =
        typeof tx.user?.findMany === "function"
          ? await tx.user.findMany({
              where: { role: { in: ["OWNER", "MANAGER"] }, isActive: true },
              select: { id: true },
            })
          : [];
      const recipientUserIds = Array.from(
        new Set([
          ...managers.map((m) => m.id),
          ...(updated.handoverEmployee?.userId
            ? [updated.handoverEmployee.userId]
            : []),
        ]),
      );

      const alertTitle = "Biên bản bàn giao ca bị đánh dấu chênh lệch";
      const shiftLabel = handover.shift?.name ?? "ca làm việc";
      const empLabel = updated.handoverEmployee?.fullName ?? "nhân viên";
      const alertMessage = `Biên bản bàn giao ca ${shiftLabel} của ${empLabel} bị đánh dấu chênh lệch: "${trimmedReason}".`;

      if (
        recipientUserIds.length > 0 &&
        typeof tx.notification?.createMany === "function"
      ) {
        await createNotifications(
          tx,
          recipientUserIds.map((userId) => ({
            userId,
            type: "SYSTEM_ALERT" as const,
            title: alertTitle,
            message: alertMessage,
            linkUrl: "/handovers",
          })),
        );
      }

      return {
        updated,
        recipientUserIds,
        alertTitle,
        alertMessage,
      };
    });

    if (txResult.recipientUserIds.length > 0) {
      await dispatchNotificationsToUsers(txResult.recipientUserIds, {
        eventType: "HANDOVER_DISCREPANCY",
        title: txResult.alertTitle,
        message: txResult.alertMessage,
        linkUrl: "/handovers",
        severity: "warning",
        includeManagers: true,
        includeGroupTelegram: true,
      });
    }

    invalidateDashboardCache();
    return txResult.updated;
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

    invalidateDashboardCache();
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
