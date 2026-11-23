import type { SwapStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { formatDateVN, formatIsoDateOnly, formatTimeVN } from "@/lib/date";
import {
  AppForbiddenError,
  AppNotFoundError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import { parseOrThrow } from "@/lib/validation";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { invalidateDashboardCache } from "@/modules/dashboard/dashboard.service";
import {
  createNotifications,
  dispatchNotificationsToUsers,
} from "@/modules/notifications/notification.service";
import { loadAssignmentContexts } from "@/modules/schedules/assignment-context";
import { evaluateAssignment } from "@/modules/schedules/conflict-detector";
import {
  assertScheduleEditable,
  lockEmployeeForScheduling,
  recordScheduleRevision,
  refreshShiftStatus,
} from "@/modules/schedules/schedule-lifecycle";
import type { SwapRequestDto } from "./swap.types";
import {
  createSwapRequestSchema,
  respondSwapSchema,
  reviewSwapSchema,
  type CreateSwapRequestInput,
  type RespondSwapInput,
  type ReviewSwapInput,
} from "./swap.validation";

export const swapService = {
  /**
   * Step 1: Requester proposes a shift swap with target employee.
   */
  async requestSwap(
    actor: SessionUser,
    rawInput: CreateSwapRequestInput,
  ): Promise<SwapRequestDto> {
    assertPermission(actor.role, "self:requests");

    if (!actor.employeeId) {
      throw new AppValidationError("Tài khoản chưa được liên kết với hồ sơ nhân viên");
    }

    const data = parseOrThrow(createSwapRequestSchema, rawInput);

    if (data.targetEmployeeId === actor.employeeId) {
      throw new AppValidationError("Không thể tự đổi ca với chính mình");
    }

    const [assignment, targetEmployee] = await Promise.all([
      prisma.shiftAssignment.findUnique({
        where: {
          shiftId_employeeId: {
            shiftId: data.shiftId,
            employeeId: actor.employeeId,
          },
        },
        include: {
          shift: { include: { schedule: true } },
          employee: { select: { fullName: true } },
        },
      }),
      prisma.employee.findUnique({
        where: { id: data.targetEmployeeId },
        select: { id: true, userId: true, fullName: true, status: true },
      }),
    ]);

    if (!assignment || assignment.status !== "ASSIGNED") {
      throw new AppValidationError("Bạn không được phân công vào ca làm việc này");
    }

    if (!targetEmployee || targetEmployee.status === "INACTIVE") {
      throw new AppValidationError("Nhân viên nhận ca không hợp lệ hoặc đã nghỉ việc");
    }

    assertScheduleEditable(assignment.shift.schedule.status);

    if (assignment.shift.endAt.getTime() <= Date.now()) {
      throw new AppValidationError("Ca làm việc này đã kết thúc, không thể gửi yêu cầu đổi ca");
    }

    const [existingActiveSwap, targetAlreadyInShift] = await Promise.all([
      prisma.swapRequest.findFirst({
        where: {
          shiftId: data.shiftId,
          requesterId: actor.employeeId,
          status: { in: ["PENDING", "ACCEPTED"] },
        },
        select: { id: true },
      }),
      prisma.shiftAssignment.findUnique({
        where: {
          shiftId_employeeId: {
            shiftId: data.shiftId,
            employeeId: data.targetEmployeeId,
          },
        },
        select: { status: true },
      }),
    ]);

    if (existingActiveSwap) {
      throw new AppValidationError("Bạn đã có yêu cầu đổi ca đang chờ xử lý cho ca này");
    }

    if (targetAlreadyInShift?.status === "ASSIGNED") {
      throw new AppValidationError("Đồng nghiệp này đã được phân công vào cùng ca này rồi");
    }

    const created = await prisma.$transaction(async (tx) => {
      const swap = await tx.swapRequest.create({
        data: {
          shiftId: data.shiftId,
          shiftAssignmentId: assignment.id,
          requesterId: actor.employeeId!,
          targetEmployeeId: data.targetEmployeeId,
          reason: data.reason ?? null,
          status: "PENDING",
        },
        include: {
          shift: true,
          requester: { select: { fullName: true } },
          targetEmployee: { select: { fullName: true } },
        },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SWAP_REQUESTED",
          entityType: "SwapRequest",
          entityId: swap.id,
          newValues: {
            shiftId: data.shiftId,
            requesterId: actor.employeeId,
            targetEmployeeId: data.targetEmployeeId,
          },
        },
        tx,
      );

      // Notify target employee
      await createNotifications(tx, [
        {
          userId: targetEmployee.userId,
          type: "SWAP_REQUESTED",
          title: "Lời mời đổi ca mới",
          message: `${assignment.employee.fullName} muốn đổi ${swap.shift.name} ngày ${formatDateVN(swap.shift.workDate)} cho bạn`,
          linkUrl: "/employee/requests",
        },
      ]);

      return swap;
    });

    await dispatchNotificationsToUsers([targetEmployee.userId], {
      eventType: "SWAP_REQUESTED",
      title: "Lời mời đổi ca mới",
      message: `${assignment.employee.fullName} muốn đổi ${created.shift.name} ngày ${formatDateVN(created.shift.workDate)} cho bạn`,
      linkUrl: "/employee/requests",
    });

    invalidateDashboardCache();

    return {
      id: created.id,
      shiftId: created.shiftId,
      shiftName: created.shift.name,
      workDate: formatIsoDateOnly(created.shift.workDate),
      startTime: formatTimeVN(created.shift.startAt),
      endTime: formatTimeVN(created.shift.endAt),
      requesterId: created.requesterId,
      requesterName: created.requester.fullName,
      targetEmployeeId: created.targetEmployeeId,
      targetEmployeeName: created.targetEmployee.fullName,
      reason: created.reason,
      status: created.status,
      targetRespondedAt: null,
      reviewedById: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: created.createdAt.toISOString(),
    };
  },

  /**
   * Step 2: Target employee accepts or declines the swap request.
   */
  async respondToSwap(
    actor: SessionUser,
    swapId: string,
    rawInput: RespondSwapInput,
  ): Promise<SwapRequestDto> {
    assertPermission(actor.role, "self:requests");

    const data = parseOrThrow(respondSwapSchema, rawInput);

    const result = await prisma.$transaction(async (tx) => {
      const swap = await tx.swapRequest.findUnique({
        where: { id: swapId },
        include: {
          shift: true,
          requester: { select: { userId: true, fullName: true } },
          targetEmployee: { select: { fullName: true } },
        },
      });

      if (!swap) {
        throw new AppNotFoundError("Không tìm thấy yêu cầu đổi ca");
      }

      if (swap.targetEmployeeId !== actor.employeeId) {
        throw new AppForbiddenError("Bạn không phải người nhận yêu cầu đổi ca này");
      }

      if (swap.status !== "PENDING") {
        throw new AppValidationError("Yêu cầu này đã được phản hồi hoặc đã đóng");
      }

      const now = new Date();
      const nextStatus = data.accept ? ("ACCEPTED" as const) : ("REJECTED" as const);

      const updated = await tx.swapRequest.update({
        where: { id: swapId },
        data: {
          status: nextStatus,
          targetRespondedAt: now,
        },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: `SWAP_RESPONDED_${nextStatus}`,
          entityType: "SwapRequest",
          entityId: swapId,
          newValues: { status: nextStatus },
        },
        tx,
      );

      let managerIds: string[] = [];
      let notifTitle = "";
      let notifMessage = "";

      if (data.accept) {
        // Notify managers for step 3 approval
        const managers = await tx.user.findMany({
          where: { role: { in: ["OWNER", "MANAGER"] }, isActive: true },
          select: { id: true },
        });
        managerIds = managers.map((m) => m.id);
        notifTitle = `Yêu cầu đổi ca chờ duyệt: ${swap.requester.fullName} ➔ ${swap.targetEmployee.fullName}`;
        notifMessage = `${swap.targetEmployee.fullName} đã đồng ý nhận ${swap.shift.name} (${formatDateVN(swap.shift.workDate)}). Chờ Quản lý phê duyệt!`;

        await createNotifications(
          tx,
          managerIds.map((id) => ({
            userId: id,
            type: "SWAP_ACCEPTED" as const,
            title: notifTitle,
            message: notifMessage,
            linkUrl: "/requests",
          })),
        );
      } else {
        // Notify requester that target declined
        notifTitle = "Yêu cầu đổi ca bị từ chối";
        notifMessage = `${swap.targetEmployee.fullName} đã từ chối nhận ca làm của bạn.`;
        await createNotifications(tx, [
          {
            userId: swap.requester.userId,
            type: "SWAP_REVIEWED",
            title: notifTitle,
            message: notifMessage,
            linkUrl: "/employee/requests",
          },
        ]);
      }

      return {
        ...updated,
        shift: swap.shift,
        requester: swap.requester,
        targetEmployee: swap.targetEmployee,
        managerIds,
        notifTitle,
        notifMessage,
      };
    });

    if (data.accept) {
      await dispatchNotificationsToUsers(result.managerIds, {
        eventType: "SWAP_ACCEPTED",
        title: result.notifTitle,
        message: result.notifMessage,
        linkUrl: "/requests",
        includeManagers: true,
      });
    } else {
      await dispatchNotificationsToUsers([result.requester.userId], {
        eventType: "SWAP_REVIEWED",
        title: result.notifTitle,
        message: result.notifMessage,
        linkUrl: "/employee/requests",
      });
    }

    invalidateDashboardCache();

    return {
      id: result.id,
      shiftId: result.shiftId,
      shiftName: result.shift.name,
      workDate: formatIsoDateOnly(result.shift.workDate),
      startTime: formatTimeVN(result.shift.startAt),
      endTime: formatTimeVN(result.shift.endAt),
      requesterId: result.requesterId,
      requesterName: result.requester.fullName,
      targetEmployeeId: result.targetEmployeeId,
      targetEmployeeName: result.targetEmployee.fullName,
      reason: result.reason,
      status: result.status,
      targetRespondedAt: result.targetRespondedAt?.toISOString() ?? null,
      reviewedById: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: result.createdAt.toISOString(),
    };
  },

  /**
   * Step 3: Manager reviews the swap request.
   * If approved, transactionally reassigns the shift from Employee A to Employee B.
   * NEVER allows a shift swap to bypass manager approval!
   */
  async reviewSwap(
    actor: SessionUser,
    swapId: string,
    rawInput: ReviewSwapInput,
  ): Promise<SwapRequestDto> {
    assertPermission(actor.role, "requests:review");
    const data = parseOrThrow(reviewSwapSchema, rawInput);

    const result = await prisma.$transaction(async (tx) => {
      const swap = await tx.swapRequest.findUnique({
        where: { id: swapId },
        include: {
          shift: { include: { schedule: true } },
          shiftAssignment: true,
          requester: { select: { userId: true, fullName: true } },
          targetEmployee: { select: { userId: true, fullName: true, primaryPositionId: true } },
        },
      });

      if (!swap) {
        throw new AppNotFoundError("Không tìm thấy yêu cầu đổi ca");
      }

      if (swap.status !== "ACCEPTED") {
        throw new AppValidationError(
          "Chỉ có thể phê duyệt yêu cầu đổi ca đã được nhân viên nhận đồng ý (ACCEPTED)",
        );
      }

      assertScheduleEditable(swap.shift.schedule.status);

      const now = new Date();
      const nextStatus = data.approved ? ("APPROVED" as const) : ("REJECTED" as const);

      await tx.swapRequest.update({
        where: { id: swapId },
        data: {
          status: nextStatus,
          reviewedById: actor.userId,
          reviewedAt: now,
          reviewNote: data.reviewNote ?? null,
        },
      });

      if (data.approved) {
        const lockOrder = [swap.requesterId, swap.targetEmployeeId].sort();
        for (const empId of lockOrder) {
          await lockEmployeeForScheduling(tx, empId);
        }

        const otherAssigned = await tx.shiftAssignment.findMany({
          where: {
            shiftId: swap.shiftId,
            status: "ASSIGNED",
            employeeId: { not: swap.requesterId },
          },
          select: { employeeId: true, positionId: true },
        });

        if (otherAssigned.some((a) => a.employeeId === swap.targetEmployeeId)) {
          throw new AppValidationError("Nhân viên nhận ca đã được phân công trong ca này rồi");
        }

        const weekStart = formatIsoDateOnly(swap.shift.schedule.weekStart);
        const contexts = await loadAssignmentContexts(tx, {
          shift: {
            id: swap.shift.id,
            name: swap.shift.name,
            templateId: swap.shift.templateId,
            workDate: swap.shift.workDate,
            startAt: swap.shift.startAt,
            endAt: swap.shift.endAt,
            breakMinutes: swap.shift.breakMinutes,
          },
          weekStart,
          employeeIds: [swap.targetEmployeeId],
        });

        const targetCtx = contexts.get(swap.targetEmployeeId);
        if (!targetCtx) {
          throw new AppValidationError("Nhân viên nhận ca không tồn tại hoặc đã ngừng hoạt động");
        }

        const assignedPositionId = swap.targetEmployee.primaryPositionId;

        const evaluation = evaluateAssignment({
          ...targetCtx.base,
          positionId: assignedPositionId,
        });
        const blocking = evaluation.conflicts.filter((c) => c.severity === "BLOCKING");
        if (blocking.length > 0) {
          throw new AppValidationError(
            `Không thể duyệt đổi ca: ${blocking.map((c) => c.message).join("; ")}`,
          );
        }

        // Transactional reassignment:
        // Update old assignment to REMOVED or reassign
        if (swap.shiftAssignmentId) {
          await tx.shiftAssignment.update({
            where: { id: swap.shiftAssignmentId },
            data: { status: "REMOVED", explanation: "Chuyển ca theo yêu cầu đổi ca được duyệt" },
          });
        }

        // Create new assignment for target employee
        await tx.shiftAssignment.upsert({
          where: {
            shiftId_employeeId: {
              shiftId: swap.shiftId,
              employeeId: swap.targetEmployeeId,
            },
          },
          update: {
            status: "ASSIGNED",
            positionId: assignedPositionId,
            assignedById: actor.userId,
            explanation: `Nhận ca từ ${swap.requester.fullName} (Đổi ca được duyệt)`,
          },
          create: {
            shiftId: swap.shiftId,
            employeeId: swap.targetEmployeeId,
            positionId: assignedPositionId,
            status: "ASSIGNED",
            assignedById: actor.userId,
            explanation: `Nhận ca từ ${swap.requester.fullName} (Đổi ca được duyệt)`,
          },
        });

        await refreshShiftStatus(tx, swap.shiftId);

        const summary = `Đổi ca được duyệt: chuyển ${swap.shift.name} (${formatDateVN(swap.shift.workDate)}) từ ${swap.requester.fullName} sang ${swap.targetEmployee.fullName}`;

        await recordScheduleRevision(tx, {
          scheduleId: swap.shift.scheduleId,
          actorUserId: actor.userId,
          action: "SHIFT_SWAP_APPROVED",
          summary,
        });

        // Notify both employees
        await createNotifications(tx, [
          {
            userId: swap.requester.userId,
            type: "SWAP_REVIEWED",
            title: "Yêu cầu đổi ca ĐÃ ĐƯỢC DUYỆT",
            message: `Quản lý đã duyệt đổi ${swap.shift.name} (${formatDateVN(swap.shift.workDate)}) sang cho ${swap.targetEmployee.fullName}.`,
            linkUrl: "/employee/schedule",
          },
          {
            userId: swap.targetEmployee.userId,
            type: "SWAP_REVIEWED",
            title: "Ca làm mới đã được gán cho bạn",
            message: `Quản lý đã duyệt nhận ${swap.shift.name} (${formatDateVN(swap.shift.workDate)}) từ ${swap.requester.fullName}.`,
            linkUrl: "/employee/schedule",
          },
        ]);
      } else {
        // Rejected by manager
        await createNotifications(tx, [
          {
            userId: swap.requester.userId,
            type: "SWAP_REVIEWED",
            title: "Yêu cầu đổi ca KHÔNG ĐƯỢC DUYỆT",
            message: `Quản lý từ chối yêu cầu đổi ca. Lý do: ${data.reviewNote || "Không duyệt"}`,
            linkUrl: "/employee/requests",
          },
          {
            userId: swap.targetEmployee.userId,
            type: "SWAP_REVIEWED",
            title: "Yêu cầu đổi ca không được duyệt",
            message: `Quản lý từ chối duyệt yêu cầu đổi ca từ ${swap.requester.fullName}.`,
            linkUrl: "/employee/requests",
          },
        ]);
      }

      await recordAuditLog(
        {
          userId: actor.userId,
          action: `SWAP_${nextStatus}`,
          entityType: "SwapRequest",
          entityId: swapId,
          newValues: { status: nextStatus, reviewNote: data.reviewNote },
        },
        tx,
      );

      return {
        requesterUserId: swap.requester.userId,
        targetUserId: swap.targetEmployee.userId,
        dto: {
          id: swap.id,
          shiftId: swap.shiftId,
          shiftName: swap.shift.name,
          workDate: formatIsoDateOnly(swap.shift.workDate),
          startTime: formatTimeVN(swap.shift.startAt),
          endTime: formatTimeVN(swap.shift.endAt),
          requesterId: swap.requesterId,
          requesterName: swap.requester.fullName,
          targetEmployeeId: swap.targetEmployeeId,
          targetEmployeeName: swap.targetEmployee.fullName,
          reason: swap.reason,
          status: nextStatus,
          targetRespondedAt: swap.targetRespondedAt?.toISOString() ?? null,
          reviewedById: actor.userId,
          reviewedByName: actor.fullName,
          reviewedAt: now.toISOString(),
          reviewNote: data.reviewNote ?? null,
          createdAt: swap.createdAt.toISOString(),
        },
      };
    });

    await dispatchNotificationsToUsers(
      [result.requesterUserId, result.targetUserId],
      {
        eventType: "SWAP_REVIEWED",
        title: data.approved
          ? "Yêu cầu đổi ca ĐÃ ĐƯỢC DUYỆT"
          : "Yêu cầu đổi ca KHÔNG ĐƯỢC DUYỆT",
        message: data.approved
          ? `Quản lý đã duyệt đổi ${result.dto.shiftName} (${formatDateVN(result.dto.workDate)}) từ ${result.dto.requesterName} sang ${result.dto.targetEmployeeName}.`
          : `Quản lý từ chối yêu cầu đổi ca. Lý do: ${data.reviewNote || "Không duyệt"}`,
        linkUrl: data.approved ? "/employee/schedule" : "/employee/requests",
      },
    );

    invalidateDashboardCache();
    return result.dto;
  },

  async listSwaps(
    actor: SessionUser,
    options?: { status?: SwapStatus },
  ): Promise<SwapRequestDto[]> {
    const isManager = actor.role === "OWNER" || actor.role === "MANAGER";

    const rows = await prisma.swapRequest.findMany({
      where: {
        ...(isManager
          ? {}
          : {
              OR: [
                { requesterId: actor.employeeId! },
                { targetEmployeeId: actor.employeeId! },
              ],
            }),
        ...(options?.status ? { status: options.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        shift: true,
        requester: { select: { fullName: true } },
        targetEmployee: { select: { fullName: true } },
        reviewedBy: {
          select: { employee: { select: { fullName: true } }, email: true },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      shiftId: r.shiftId,
      shiftName: r.shift.name,
      workDate: formatIsoDateOnly(r.shift.workDate),
      startTime: formatTimeVN(r.shift.startAt),
      endTime: formatTimeVN(r.shift.endAt),
      requesterId: r.requesterId,
      requesterName: r.requester.fullName,
      targetEmployeeId: r.targetEmployeeId,
      targetEmployeeName: r.targetEmployee.fullName,
      reason: r.reason,
      status: r.status,
      targetRespondedAt: r.targetRespondedAt?.toISOString() ?? null,
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.employee?.fullName ?? r.reviewedBy?.email ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
    }));
  },
};
