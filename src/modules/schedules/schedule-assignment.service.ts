import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { formatDateVN, formatIsoDateOnly, formatTimeVN } from "@/lib/date";
import {
  AppConfirmationRequiredError,
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
import {
  evaluateAssignment,
  type AssignmentEvaluation,
} from "./conflict-detector";
import {
  loadAssignmentContexts,
  suggestPositionId,
} from "./assignment-context";
import {
  assertScheduleEditable,
  lockEmployeeForScheduling,
  notifyScheduleChange,
  recordScheduleRevision,
  refreshShiftStatus,
} from "./schedule-lifecycle";
import type { CandidateDto } from "./schedule.types";
import {
  assignEmployeeSchema,
  moveAssignmentSchema,
  type AssignEmployeeInput,
  type MoveAssignmentInput,
} from "./schedule.validation";

type Tx = Prisma.TransactionClient;

async function loadShiftWithContext(tx: Tx, shiftId: string) {
  const shift = await tx.shift.findUnique({
    where: { id: shiftId },
    include: {
      schedule: true,
      positionRequirements: {
        include: { position: { select: { id: true, name: true, sortOrder: true } } },
      },
      assignments: {
        where: { status: "ASSIGNED" },
        include: { employee: { select: { id: true, fullName: true } } },
      },
    },
  });
  if (!shift) {
    throw new AppNotFoundError("Không tìm thấy ca làm");
  }
  if (shift.status === "CANCELLED") {
    throw new AppValidationError("Ca làm đã bị hủy");
  }
  assertScheduleEditable(shift.schedule.status);
  return shift;
}

export const scheduleAssignmentService = {
  /**
   * Evaluates all active employees for assignment to `shiftId` and returns
   * candidates scored and sorted for manual picker display.
   */
  async listCandidates(actor: SessionUser, shiftId: string): Promise<CandidateDto[]> {
    assertPermission(actor.role, "schedules:manage");

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        schedule: { select: { weekStart: true } },
        positionRequirements: true,
        assignments: { where: { status: "ASSIGNED" }, select: { employeeId: true } },
      },
    });
    if (!shift) {
      throw new AppNotFoundError("Không tìm thấy ca làm");
    }

    const weekStart = formatIsoDateOnly(shift.schedule.weekStart);
    const assignedIds = new Set(shift.assignments.map((a) => a.employeeId));

    const contexts = await loadAssignmentContexts(prisma, {
      shift: {
        id: shift.id,
        name: shift.name,
        templateId: shift.templateId,
        workDate: shift.workDate,
        startAt: shift.startAt,
        endAt: shift.endAt,
        breakMinutes: shift.breakMinutes,
      },
      weekStart,
    });

    const reqs = shift.positionRequirements.map((r) => ({
      positionId: r.positionId,
      minCount: r.minCount,
      assignedCount: 0,
    }));

    const candidates: CandidateDto[] = [];
    for (const ctx of contexts.values()) {
      const alreadyAssigned = assignedIds.has(ctx.employeeId);
      const suggestedPositionId = suggestPositionId(ctx, reqs);
      const evaluation: AssignmentEvaluation = evaluateAssignment({
        ...ctx.base,
        positionId: suggestedPositionId,
      });

      candidates.push({
        employeeId: ctx.employeeId,
        fullName: ctx.fullName,
        employeeCode: ctx.employeeCode,
        primaryPositionName: ctx.primaryPositionName,
        suggestedPositionId,
        skillPositionIds: ctx.skillPositionIds,
        alreadyAssigned,
        evaluation,
      });
    }

    // Sort order:
    // 1. Not already assigned
    // 2. Non-blocking (no overlap/leave/inactive)
    // 3. Availability preference (PREFERRED > AVAILABLE > UNKNOWN > UNAVAILABLE)
    // 4. Fewest warnings
    // 5. Least projected weekly hours (workload balance)
    const prefRank: Record<string, number> = {
      PREFERRED: 0,
      AVAILABLE: 1,
      UNKNOWN: 2,
      UNAVAILABLE: 3,
    };

    candidates.sort((a, b) => {
      if (a.alreadyAssigned !== b.alreadyAssigned) {
        return a.alreadyAssigned ? 1 : -1;
      }
      if (a.evaluation.blocking !== b.evaluation.blocking) {
        return a.evaluation.blocking ? 1 : -1;
      }
      const rankDiff =
        (prefRank[a.evaluation.preference] ?? 9) -
        (prefRank[b.evaluation.preference] ?? 9);
      if (rankDiff !== 0) return rankDiff;

      const warnA = a.evaluation.conflicts.filter((c) => c.severity === "WARNING").length;
      const warnB = b.evaluation.conflicts.filter((c) => c.severity === "WARNING").length;
      if (warnA !== warnB) return warnA - warnB;

      return a.evaluation.projectedWeeklyMinutes - b.evaluation.projectedWeeklyMinutes;
    });

    return candidates;
  },

  async assign(
    actor: SessionUser,
    shiftId: string,
    rawInput: AssignEmployeeInput,
  ) {
    assertPermission(actor.role, "schedules:manage");
    const data = parseOrThrow(assignEmployeeSchema, rawInput);

    const result = await prisma.$transaction(async (tx) => {
      await lockEmployeeForScheduling(tx, data.employeeId);
      const shift = await loadShiftWithContext(tx, shiftId);

      if (shift.maxStaff !== null && shift.assignments.length >= shift.maxStaff) {
        throw new AppValidationError(
          `Ca làm đã đủ số lượng nhân sự tối đa (${shift.maxStaff} người)`,
        );
      }

      const existingAssignment = shift.assignments.find(
        (a) => a.employeeId === data.employeeId,
      );
      if (existingAssignment) {
        throw new AppValidationError("Nhân viên đã được phân công vào ca này");
      }

      const weekStart = formatIsoDateOnly(shift.schedule.weekStart);
      const contexts = await loadAssignmentContexts(tx, {
        shift: {
          id: shift.id,
          name: shift.name,
          templateId: shift.templateId,
          workDate: shift.workDate,
          startAt: shift.startAt,
          endAt: shift.endAt,
          breakMinutes: shift.breakMinutes,
        },
        weekStart,
        employeeIds: [data.employeeId],
      });
      const ctx = contexts.get(data.employeeId);
      if (!ctx) {
        throw new AppNotFoundError("Không tìm thấy thông tin nhân viên");
      }

      const positionId =
        data.positionId ??
        suggestPositionId(
          ctx,
          shift.positionRequirements.map((r) => ({
            positionId: r.positionId,
            minCount: r.minCount,
            assignedCount: shift.assignments.filter((a) => a.positionId === r.positionId).length,
          })),
        );

      const evaluation = evaluateAssignment({ ...ctx.base, positionId });
      const blocking = evaluation.conflicts.filter((c) => c.severity === "BLOCKING");
      if (blocking.length > 0) {
        throw new AppValidationError(
          `Không thể phân công: ${blocking.map((c) => c.message).join("; ")}`,
        );
      }

      const warnings = evaluation.conflicts.filter((c) => c.severity === "WARNING");
      if (warnings.length > 0 && !data.allowWarnings) {
        throw new AppConfirmationRequiredError(
          "Cảnh báo xung đột khi phân công nhân viên",
          {
            conflicts: warnings,
            employeeName: ctx.fullName,
            shiftName: shift.name,
          },
        );
      }

      const assignment = await tx.shiftAssignment.upsert({
        where: {
          shiftId_employeeId: { shiftId, employeeId: data.employeeId },
        },
        update: {
          positionId,
          status: "ASSIGNED",
          assignedById: actor.userId,
          explanation: warnings.map((w) => w.message).join(" | ") || null,
        },
        create: {
          shiftId,
          employeeId: data.employeeId,
          positionId,
          status: "ASSIGNED",
          assignedById: actor.userId,
          explanation: warnings.map((w) => w.message).join(" | ") || null,
        },
      });

      await refreshShiftStatus(tx, shiftId);

      const summary = `Gán ${ctx.fullName} vào ${shift.name} (${formatDateVN(shift.workDate)})`;
      await recordScheduleRevision(tx, {
        scheduleId: shift.scheduleId,
        actorUserId: actor.userId,
        action: "EMPLOYEE_ASSIGNED",
        summary,
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SHIFT_ASSIGNED",
          entityType: "ShiftAssignment",
          entityId: assignment.id,
          newValues: {
            shiftId,
            employeeId: data.employeeId,
            positionId,
            warnings: warnings.map((w) => w.code),
          },
        },
        tx,
      );

      await notifyScheduleChange(tx, {
        status: shift.schedule.status,
        weekStart: shift.schedule.weekStart,
        employeeIds: [data.employeeId],
        detail: `Bạn được phân công vào ${shift.name} ngày ${formatDateVN(shift.workDate)}`,
      });

      return { id: assignment.id, warnings };
    });

    invalidateDashboardCache();
    return result;
  },

  async remove(actor: SessionUser, assignmentId: string) {
    assertPermission(actor.role, "schedules:manage");

    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.shiftAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          shift: { include: { schedule: true } },
          employee: { select: { id: true, fullName: true } },
        },
      });
      if (!assignment) {
        throw new AppNotFoundError("Không tìm thấy phân công");
      }
      assertScheduleEditable(assignment.shift.schedule.status);

      await lockEmployeeForScheduling(tx, assignment.employeeId);

      // If published before, keep row with REMOVED status for audit; else hard delete
      if (assignment.shift.schedule.publishedAt === null) {
        await tx.shiftAssignment.delete({ where: { id: assignmentId } });
      } else {
        await tx.shiftAssignment.update({
          where: { id: assignmentId },
          data: { status: "REMOVED" },
        });
      }

      await refreshShiftStatus(tx, assignment.shiftId);

      const summary = `Gỡ ${assignment.employee.fullName} khỏi ${assignment.shift.name} (${formatDateVN(assignment.shift.workDate)})`;
      await recordScheduleRevision(tx, {
        scheduleId: assignment.shift.scheduleId,
        actorUserId: actor.userId,
        action: "EMPLOYEE_REMOVED",
        summary,
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SHIFT_ASSIGNMENT_REMOVED",
          entityType: "ShiftAssignment",
          entityId: assignmentId,
          oldValues: {
            shiftId: assignment.shiftId,
            employeeId: assignment.employeeId,
          },
        },
        tx,
      );

      await notifyScheduleChange(tx, {
        status: assignment.shift.schedule.status,
        weekStart: assignment.shift.schedule.weekStart,
        employeeIds: [assignment.employeeId],
        detail: `Bạn đã được rút khỏi ${assignment.shift.name} ngày ${formatDateVN(assignment.shift.workDate)}`,
      });

      return { id: assignmentId };
    });

    invalidateDashboardCache();
    return result;
  },

  /**
   * Instant Emergency Replacement:
   * Removes an employee who has an urgent absence (illness, sudden emergency)
   * and immediately assigns a qualified, available standby employee with push notifications.
   */
  async emergencyReplace(
    actor: SessionUser,
    shiftId: string,
    input: {
      absentEmployeeId: string;
      replacementEmployeeId: string;
      reason: string;
    },
  ) {
    assertPermission(actor.role, "schedules:manage");

    if (!input.absentEmployeeId || !input.replacementEmployeeId) {
      throw new AppValidationError("Vui lòng chọn nhân viên báo nghỉ và nhân viên thay thế");
    }
    if (input.absentEmployeeId === input.replacementEmployeeId) {
      throw new AppValidationError("Nhân viên thay thế không thể trùng với nhân viên báo nghỉ");
    }
    const reason = input.reason?.trim() || "Có việc đột xuất";

    const txResult = await prisma.$transaction(async (tx) => {
      // Lock both employees for scheduling serialization
      await lockEmployeeForScheduling(tx, input.absentEmployeeId);
      await lockEmployeeForScheduling(tx, input.replacementEmployeeId);

      const shift = await loadShiftWithContext(tx, shiftId);

      // Verify absent employee has an active assignment
      const absentAssignment = shift.assignments.find(
        (a) => a.employeeId === input.absentEmployeeId,
      );
      if (!absentAssignment) {
        throw new AppValidationError("Nhân viên báo nghỉ không có tên trong ca làm này");
      }

      if (shift.assignments.some((a) => a.employeeId === input.replacementEmployeeId)) {
        throw new AppValidationError("Nhân viên thay thế đã được phân công trong ca làm này rồi");
      }

      // Check replacement employee
      const replacementEmp = await tx.employee.findUnique({
        where: { id: input.replacementEmployeeId },
        select: {
          id: true,
          fullName: true,
          employeeCode: true,
          status: true,
          primaryPositionId: true,
          user: { select: { id: true } },
          skills: { select: { positionId: true } },
        },
      });

      if (!replacementEmp || replacementEmp.status !== "ACTIVE") {
        throw new AppValidationError("Nhân viên thay thế không tồn tại hoặc đã ngừng làm việc");
      }

      // Check overlap for replacement employee
      const existingOverlaps = await tx.shiftAssignment.findMany({
        where: {
          employeeId: input.replacementEmployeeId,
          status: "ASSIGNED",
          shift: {
            id: { not: shiftId },
            status: { not: "CANCELLED" },
            startAt: { lt: shift.endAt },
            endAt: { gt: shift.startAt },
          },
        },
        include: { shift: { select: { name: true } } },
      });

      if (existingOverlaps.length > 0) {
        const otherName = existingOverlaps[0]?.shift.name;
        throw new AppValidationError(
          `Nhân viên ${replacementEmp.fullName} đã có ca làm "${otherName}" trùng giờ, không thể thay thế!`,
        );
      }

      // Check approved leave
      const onLeave = await tx.leaveRequest.findFirst({
        where: {
          employeeId: input.replacementEmployeeId,
          status: "APPROVED",
          startAt: { lt: shift.endAt },
          endAt: { gt: shift.startAt },
        },
      });
      if (onLeave) {
        throw new AppValidationError(`Nhân viên ${replacementEmp.fullName} đang trong kỳ nghỉ phép đã duyệt`);
      }

      // Pick original position if replacement has the skill, otherwise fall back to their primary position
      const hasOriginalPositionSkill =
        replacementEmp.primaryPositionId === absentAssignment.positionId ||
        replacementEmp.skills.some((s) => s.positionId === absentAssignment.positionId);

      const targetPositionId = hasOriginalPositionSkill
        ? absentAssignment.positionId
        : replacementEmp.primaryPositionId;

      // 1. Mark absent employee assignment as REMOVED
      await tx.shiftAssignment.update({
        where: { id: absentAssignment.id },
        data: {
          status: "REMOVED",
          explanation: `Nghỉ đột xuất: ${reason} (Đã thay thế bởi ${replacementEmp.fullName})`,
        },
      });

      // 2. Upsert replacement employee assignment
      const newAssignment = await tx.shiftAssignment.upsert({
        where: {
          shiftId_employeeId: {
            shiftId,
            employeeId: input.replacementEmployeeId,
          },
        },
        update: {
          positionId: targetPositionId,
          status: "ASSIGNED",
          assignedById: actor.userId,
          explanation: `Thay thế khẩn cấp cho ${absentAssignment.employee.fullName} (Lý do: ${reason})`,
        },
        create: {
          shiftId,
          employeeId: input.replacementEmployeeId,
          positionId: targetPositionId,
          status: "ASSIGNED",
          assignedById: actor.userId,
          explanation: `Thay thế khẩn cấp cho ${absentAssignment.employee.fullName} (Lý do: ${reason})`,
        },
      });

      await refreshShiftStatus(tx, shiftId);

      // 3. Record Revision
      const shiftWorkDateStr = formatDateVN(shift.workDate);
      const summary = `[Thay ca khẩn cấp] ${replacementEmp.fullName} thay cho ${absentAssignment.employee.fullName} (${shift.name} ngày ${shiftWorkDateStr}) do: ${reason}`;
      await recordScheduleRevision(tx, {
        scheduleId: shift.scheduleId,
        actorUserId: actor.userId,
        action: "EMERGENCY_REPLACEMENT",
        summary,
      });

      // 4. Audit Log
      await recordAuditLog(
        {
          userId: actor.userId,
          action: "EMERGENCY_SHIFT_REPLACEMENT",
          entityType: "ShiftAssignment",
          entityId: newAssignment.id,
          oldValues: {
            absentEmployeeId: input.absentEmployeeId,
            absentEmployeeName: absentAssignment.employee.fullName,
          },
          newValues: {
            replacementEmployeeId: input.replacementEmployeeId,
            replacementEmployeeName: replacementEmp.fullName,
            reason,
          },
        },
        tx,
      );

      // 5. Send Urgent Notifications
      const absentEmpUser = await tx.employee.findUnique({
        where: { id: input.absentEmployeeId },
        select: { user: { select: { id: true } } },
      });

      const notifications: Array<{
        userId: string;
        type: "SCHEDULE_UPDATED";
        title: string;
        message: string;
        linkUrl?: string;
      }> = [];

      // Notification to replacement employee
      if (replacementEmp.user?.id) {
        notifications.push({
          userId: replacementEmp.user.id,
          type: "SCHEDULE_UPDATED",
          title: "⚡ ĐIỀU ĐỘNG THAY CA KHẨN CẤP",
          message: `Bạn được Quản lý điều động thay ca: ${shift.name} (${formatTimeVN(shift.startAt)} – ${formatTimeVN(shift.endAt)}, ngày ${shiftWorkDateStr}) thay cho ${absentAssignment.employee.fullName} (Lý do: ${reason}). Vui lòng có mặt đúng giờ!`,
          linkUrl: `/employee/schedule?week=${formatIsoDateOnly(shift.schedule.weekStart)}`,
        });
      }

      // Notification to absent employee
      if (absentEmpUser?.user?.id) {
        notifications.push({
          userId: absentEmpUser.user.id,
          type: "SCHEDULE_UPDATED",
          title: "✓ Đã duyệt nghỉ đột xuất & bố trí người thay",
          message: `Quản lý đã duyệt nghỉ đột xuất ca ${shift.name} (${shiftWorkDateStr}) của bạn do: "${reason}". Bạn ${replacementEmp.fullName} đã tiếp quản ca làm.`,
          linkUrl: `/employee/schedule?week=${formatIsoDateOnly(shift.schedule.weekStart)}`,
        });
      }

      // Notification to manager
      notifications.push({
        userId: actor.userId,
        type: "SCHEDULE_UPDATED",
        title: "📢 Điều động ca khẩn cấp thành công",
        message: `Đã thay thế ${absentAssignment.employee.fullName} bằng ${replacementEmp.fullName} trong ca ${shift.name} ngày ${shiftWorkDateStr} (Lý do: ${reason}).`,
        linkUrl: `/schedules`,
      });

      if (notifications.length > 0) {
        await createNotifications(tx, notifications);
      }

      return {
        externalRecipientUserIds: [
          ...(replacementEmp.user?.id ? [replacementEmp.user.id] : []),
          ...(absentEmpUser?.user?.id ? [absentEmpUser.user.id] : []),
        ],
        weekStartIso: formatIsoDateOnly(shift.schedule.weekStart),
        startTimeStr: formatTimeVN(shift.startAt),
        endTimeStr: formatTimeVN(shift.endAt),
        response: {
          success: true,
          message: `Đã điều động ${replacementEmp.fullName} thay ca khẩn cấp cho ${absentAssignment.employee.fullName}`,
          absentEmployeeName: absentAssignment.employee.fullName,
          replacementEmployeeName: replacementEmp.fullName,
          shiftName: shift.name,
          shiftDate: shiftWorkDateStr,
        },
      };
    });

    if (txResult.externalRecipientUserIds.length > 0) {
      await dispatchNotificationsToUsers(txResult.externalRecipientUserIds, {
        eventType: "SCHEDULE_UPDATED",
        title: "⚡ ĐIỀU ĐỘNG THAY CA KHẨN CẤP",
        message: `Điều động thay ca khẩn cấp: ${txResult.response.replacementEmployeeName} thay cho ${txResult.response.absentEmployeeName} trong ca ${txResult.response.shiftName} (${txResult.startTimeStr} – ${txResult.endTimeStr}, ngày ${txResult.response.shiftDate}, lý do: ${reason}).`,
        linkUrl: `/employee/schedule?week=${txResult.weekStartIso}`,
        severity: "urgent",
      });
    }

    invalidateDashboardCache();
    return txResult.response;
  },

  /**
   * Drag-and-drop: Moves an assignment from its current shift to a target shift.
   */
  async move(
    actor: SessionUser,
    assignmentId: string,
    rawInput: MoveAssignmentInput,
  ) {
    assertPermission(actor.role, "schedules:manage");
    const data = parseOrThrow(moveAssignmentSchema, rawInput);

    const result = await prisma.$transaction(async (tx) => {
      const sourceAssignment = await tx.shiftAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          shift: { include: { schedule: true } },
          employee: { select: { id: true, fullName: true } },
        },
      });
      if (!sourceAssignment || sourceAssignment.status !== "ASSIGNED") {
        throw new AppNotFoundError("Không tìm thấy phân công hợp lệ");
      }
      assertScheduleEditable(sourceAssignment.shift.schedule.status);

      if (sourceAssignment.shiftId === data.targetShiftId) {
        return { id: assignmentId };
      }

      const targetShift = await loadShiftWithContext(tx, data.targetShiftId);
      if (
        targetShift.maxStaff !== null &&
        targetShift.assignments.length >= targetShift.maxStaff
      ) {
        throw new AppValidationError(
          `Ca đích đã đủ số lượng nhân sự tối đa (${targetShift.maxStaff} người)`,
        );
      }

      await lockEmployeeForScheduling(tx, sourceAssignment.employeeId);

      const weekStart = formatIsoDateOnly(targetShift.schedule.weekStart);
      const contexts = await loadAssignmentContexts(tx, {
        shift: {
          id: targetShift.id,
          name: targetShift.name,
          templateId: targetShift.templateId,
          workDate: targetShift.workDate,
          startAt: targetShift.startAt,
          endAt: targetShift.endAt,
          breakMinutes: targetShift.breakMinutes,
        },
        weekStart,
        employeeIds: [sourceAssignment.employeeId],
        excludeShiftIds: [sourceAssignment.shiftId],
      });
      const ctx = contexts.get(sourceAssignment.employeeId);
      if (!ctx) {
        throw new AppNotFoundError("Không tìm thấy thông tin nhân viên");
      }

      const positionId = suggestPositionId(
        ctx,
        targetShift.positionRequirements.map((r) => ({
          positionId: r.positionId,
          minCount: r.minCount,
          assignedCount: targetShift.assignments.filter((a) => a.positionId === r.positionId).length,
        })),
      );

      const evaluation = evaluateAssignment({ ...ctx.base, positionId });
      const blocking = evaluation.conflicts.filter((c) => c.severity === "BLOCKING");
      if (blocking.length > 0) {
        throw new AppValidationError(
          `Không thể chuyển ca: ${blocking.map((c) => c.message).join("; ")}`,
        );
      }

      const warnings = evaluation.conflicts.filter((c) => c.severity === "WARNING");
      if (warnings.length > 0 && !data.allowWarnings) {
        throw new AppConfirmationRequiredError(
          "Cảnh báo xung đột khi chuyển ca cho nhân viên",
          {
            conflicts: warnings,
            employeeName: ctx.fullName,
            sourceShiftName: sourceAssignment.shift.name,
            targetShiftName: targetShift.name,
          },
        );
      }

      // Remove from source shift
      if (sourceAssignment.shift.schedule.publishedAt === null) {
        await tx.shiftAssignment.delete({ where: { id: assignmentId } });
      } else {
        await tx.shiftAssignment.update({
          where: { id: assignmentId },
          data: { status: "REMOVED" },
        });
      }

      // Create/upsert in target shift
      const newAssignment = await tx.shiftAssignment.upsert({
        where: {
          shiftId_employeeId: {
            shiftId: data.targetShiftId,
            employeeId: sourceAssignment.employeeId,
          },
        },
        update: {
          positionId,
          status: "ASSIGNED",
          assignedById: actor.userId,
          explanation: warnings.map((w) => w.message).join(" | ") || null,
        },
        create: {
          shiftId: data.targetShiftId,
          employeeId: sourceAssignment.employeeId,
          positionId,
          status: "ASSIGNED",
          assignedById: actor.userId,
          explanation: warnings.map((w) => w.message).join(" | ") || null,
        },
      });

      await refreshShiftStatus(tx, sourceAssignment.shiftId);
      await refreshShiftStatus(tx, data.targetShiftId);

      const summary = `Chuyển ${ctx.fullName} từ ${sourceAssignment.shift.name} sang ${targetShift.name} (${formatDateVN(targetShift.workDate)})`;
      await recordScheduleRevision(tx, {
        scheduleId: targetShift.scheduleId,
        actorUserId: actor.userId,
        action: "EMPLOYEE_MOVED",
        summary,
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SHIFT_ASSIGNMENT_MOVED",
          entityType: "ShiftAssignment",
          entityId: newAssignment.id,
          oldValues: {
            sourceShiftId: sourceAssignment.shiftId,
            employeeId: sourceAssignment.employeeId,
          },
          newValues: {
            targetShiftId: data.targetShiftId,
            warnings: warnings.map((w) => w.code),
          },
        },
        tx,
      );

      await notifyScheduleChange(tx, {
        status: targetShift.schedule.status,
        weekStart: targetShift.schedule.weekStart,
        employeeIds: [sourceAssignment.employeeId],
        detail: `Ca làm việc của bạn được chuyển từ ${sourceAssignment.shift.name} sang ${targetShift.name} (${formatDateVN(targetShift.workDate)})`,
      });

      return { id: newAssignment.id, warnings };
    });

    invalidateDashboardCache();
    return result;
  },
};

