import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { formatDateTimeVN, formatIsoDateOnly, formatTimeVN } from "@/lib/date";
import {
  AppNotFoundError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import { parseOrThrow } from "@/lib/validation";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { createNotifications } from "@/modules/notifications/notification.service";
import { scheduleAssignmentService } from "@/modules/schedules/schedule-assignment.service";
import type {
  AffectedShiftDto,
  LeaveRequestDto,
  LeaveReviewResultDto,
} from "./leave.types";
import {
  createLeaveRequestSchema,
  reviewLeaveRequestSchema,
  type CreateLeaveRequestInput,
  type ReviewLeaveRequestInput,
} from "./leave.validation";

export const leaveService = {
  async submitLeaveRequest(
    actor: SessionUser,
    rawInput: CreateLeaveRequestInput,
  ): Promise<LeaveRequestDto> {
    assertPermission(actor.role, "self:requests");

    if (!actor.employeeId) {
      throw new AppValidationError("Tài khoản chưa được liên kết với hồ sơ nhân viên");
    }

    const data = parseOrThrow(createLeaveRequestSchema, rawInput);
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);

    const created = await prisma.$transaction(async (tx) => {
      const leave = await tx.leaveRequest.create({
        data: {
          employeeId: actor.employeeId!,
          shiftId: data.shiftId ?? null,
          startAt: start,
          endAt: end,
          reason: data.reason,
          status: "PENDING",
        },
        include: {
          employee: { select: { fullName: true, employeeCode: true } },
          shift: { select: { name: true } },
        },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "LEAVE_REQUEST_SUBMITTED",
          entityType: "LeaveRequest",
          entityId: leave.id,
          newValues: {
            employeeId: actor.employeeId,
            startAt: data.startAt,
            endAt: data.endAt,
            reason: data.reason,
          },
        },
        tx,
      );

      // Notify managers
      const managers = await tx.user.findMany({
        where: { role: { in: ["OWNER", "MANAGER"] }, isActive: true },
        select: { id: true },
      });

      await createNotifications(
        tx,
        managers.map((m) => ({
          userId: m.id,
          type: "LEAVE_SUBMITTED" as const,
          title: `Đơn nghỉ phép mới: ${leave.employee.fullName}`,
          message: `${leave.employee.fullName} xin nghỉ từ ${formatDateTimeVN(start)} đến ${formatDateTimeVN(end)}: "${data.reason}"`,
          linkUrl: "/requests",
        })),
      );

      return leave;
    });

    return {
      id: created.id,
      employeeId: created.employeeId,
      employeeName: created.employee.fullName,
      employeeCode: created.employee.employeeCode,
      shiftId: created.shiftId,
      shiftName: created.shift?.name ?? null,
      startAt: created.startAt.toISOString(),
      endAt: created.endAt.toISOString(),
      reason: created.reason,
      status: created.status,
      reviewedById: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: created.createdAt.toISOString(),
    };
  },

  async listLeaveRequests(
    actor: SessionUser,
    options?: { status?: "PENDING" | "APPROVED" | "REJECTED" },
  ): Promise<LeaveRequestDto[]> {
    const isManager = actor.role === "OWNER" || actor.role === "MANAGER";

    const rows = await prisma.leaveRequest.findMany({
      where: {
        ...(isManager ? {} : { employeeId: actor.employeeId! }),
        ...(options?.status ? { status: options.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        employee: { select: { fullName: true, employeeCode: true } },
        shift: { select: { name: true } },
        reviewedBy: {
          select: { employee: { select: { fullName: true } }, email: true },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.fullName,
      employeeCode: r.employee.employeeCode,
      shiftId: r.shiftId,
      shiftName: r.shift?.name ?? null,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      reason: r.reason,
      status: r.status,
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.employee?.fullName ?? r.reviewedBy?.email ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  /**
   * Reviews leave request (APPROVED or REJECTED).
   * If APPROVED, identifies affected shifts and provides replacement recommendations.
   */
  async reviewLeaveRequest(
    actor: SessionUser,
    leaveId: string,
    rawInput: ReviewLeaveRequestInput,
  ): Promise<LeaveReviewResultDto> {
    assertPermission(actor.role, "requests:review");
    const data = parseOrThrow(reviewLeaveRequestSchema, rawInput);

    const result = await prisma.$transaction(async (tx) => {
      const leave = await tx.leaveRequest.findUnique({
        where: { id: leaveId },
        include: {
          employee: { select: { userId: true, fullName: true, employeeCode: true } },
          shift: { select: { name: true } },
        },
      });

      if (!leave) {
        throw new AppNotFoundError("Không tìm thấy đơn xin nghỉ phép");
      }

      if (leave.status !== "PENDING") {
        throw new AppValidationError("Đơn này đã được xử lý từ trước");
      }

      const now = new Date();

      await tx.leaveRequest.update({
        where: { id: leaveId },
        data: {
          status: data.status,
          reviewedById: actor.userId,
          reviewedAt: now,
          reviewNote: data.reviewNote ?? null,
        },
      });

      // Find affected assigned shifts
      const affectedAssignments = await tx.shiftAssignment.findMany({
        where: {
          employeeId: leave.employeeId,
          status: "ASSIGNED",
          shift: {
            startAt: { lt: leave.endAt },
            endAt: { gt: leave.startAt },
            status: { not: "CANCELLED" },
          },
        },
        include: {
          shift: {
            select: {
              id: true,
              name: true,
              workDate: true,
              startAt: true,
              endAt: true,
            },
          },
        },
      });

      if (data.status === "APPROVED") {
        // Automatically unassign the employee from affected shifts
        for (const a of affectedAssignments) {
          await tx.shiftAssignment.update({
            where: { id: a.id },
            data: {
              status: "REMOVED",
              explanation: `Gỡ ca tự động do nghỉ phép được duyệt (${data.reviewNote || "Theo đơn nghỉ"})`,
            },
          });
        }

        // Notify employee
        await createNotifications(tx, [
          {
            userId: leave.employee.userId,
            type: "LEAVE_REVIEWED",
            title: "Đơn xin nghỉ phép đã được DUYỆT",
            message: `Đơn nghỉ từ ${formatDateTimeVN(leave.startAt)} đã được duyệt. Ghi chú: ${data.reviewNote || "Đồng ý"}`,
            linkUrl: "/employee/requests",
          },
        ]);
      } else {
        // Notify employee of rejection
        await createNotifications(tx, [
          {
            userId: leave.employee.userId,
            type: "LEAVE_REVIEWED",
            title: "Đơn xin nghỉ phép bị TỪ CHỐI",
            message: `Đơn nghỉ từ ${formatDateTimeVN(leave.startAt)} không được duyệt. Lý do: ${data.reviewNote || "Không duyệt"}`,
            linkUrl: "/employee/requests",
          },
        ]);
      }

      await recordAuditLog(
        {
          userId: actor.userId,
          action: `LEAVE_REQUEST_${data.status}`,
          entityType: "LeaveRequest",
          entityId: leaveId,
          oldValues: { status: leave.status },
          newValues: { status: data.status, reviewNote: data.reviewNote },
        },
        tx,
      );

      return {
        leave: {
          id: leave.id,
          employeeId: leave.employeeId,
          employeeName: leave.employee.fullName,
          employeeCode: leave.employee.employeeCode,
          shiftId: leave.shiftId,
          shiftName: leave.shift?.name ?? null,
          startAt: leave.startAt.toISOString(),
          endAt: leave.endAt.toISOString(),
          reason: leave.reason,
          status: data.status,
          reviewedById: actor.userId,
          reviewedByName: actor.fullName,
          reviewedAt: now.toISOString(),
          reviewNote: data.reviewNote ?? null,
          createdAt: leave.createdAt.toISOString(),
        },
        affectedAssignments,
      };
    });

    // Outside transaction: compute replacement recommendations for affected shifts
    const affectedShiftsWithReplacements: AffectedShiftDto[] = [];
    for (const a of result.affectedAssignments) {
      let candidates: typeof affectedShiftsWithReplacements[number]["recommendedReplacements"] = [];
      try {
        candidates = await scheduleAssignmentService.listCandidates(
          actor,
          a.shift.id,
        );
      } catch {
        // ignore
      }

      affectedShiftsWithReplacements.push({
        shiftId: a.shift.id,
        shiftName: a.shift.name,
        workDate: formatIsoDateOnly(a.shift.workDate),
        startTime: formatTimeVN(a.shift.startAt),
        endTime: formatTimeVN(a.shift.endAt),
        recommendedReplacements: candidates.slice(0, 5),
      });
    }

    return {
      leave: result.leave,
      affectedShifts: affectedShiftsWithReplacements,
    };
  },
};
