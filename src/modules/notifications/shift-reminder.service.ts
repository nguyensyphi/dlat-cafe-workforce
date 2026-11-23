import type { Prisma } from "@prisma/client";
import { formatTimeVN } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { loadSettingsBundle } from "@/modules/settings/settings.service";
import type {
  ChannelTransportDeps,
  NotificationRecipient,
} from "./channels/types";
import { dispatchExternalNotifications } from "./dispatcher";
import {
  createNotificationsWithDedupeReport,
  type NotificationMessage,
} from "./notification.service";
import { normalizeNotificationPreferences } from "./notification.validation";

export interface ShiftReminderDispatchOptions {
  now?: Date;
}

export interface ShiftReminderDispatchSummary {
  checkedAssignments: number;
  dueReminders: number;
  createdInApp: number;
  skippedDuplicates: number;
  insertedDedupeKeys: string[];
  externalDispatched: number;
}

interface CandidateReminderItem {
  dedupeKey: string;
  notification: NotificationMessage;
  recipient: NotificationRecipient;
}

export const shiftReminderService = {
  async dispatchDueReminders(
    options?: ShiftReminderDispatchOptions,
    deps: ChannelTransportDeps = {},
  ): Promise<ShiftReminderDispatchSummary> {
    const bundle = await loadSettingsBundle();
    const policy = bundle.notificationPolicy;
    const now = options?.now ?? new Date();

    const startLeadMs = Math.max(0, policy.shiftStartReminderMinutes) * 60_000;
    const endLeadMs = Math.max(0, policy.shiftEndReminderMinutes) * 60_000;

    if (startLeadMs <= 0 && endLeadMs <= 0) {
      return {
        checkedAssignments: 0,
        dueReminders: 0,
        createdInApp: 0,
        skippedDuplicates: 0,
        insertedDedupeKeys: [],
        externalDispatched: 0,
      };
    }

    const startUpper = new Date(now.getTime() + startLeadMs);
    const endUpper = new Date(now.getTime() + endLeadMs);

    const windowConditions: Prisma.ShiftWhereInput[] = [];
    if (startLeadMs > 0) {
      windowConditions.push({
        startAt: { gt: now, lte: startUpper },
      });
    }
    if (endLeadMs > 0) {
      windowConditions.push({
        endAt: { gt: now, lte: endUpper },
      });
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        status: "ASSIGNED",
        employee: {
          status: "ACTIVE",
          deletedAt: null,
          user: { isActive: true },
        },
        shift: {
          status: { not: "CANCELLED" },
          schedule: { status: { in: ["PUBLISHED", "LOCKED"] } },
          OR: windowConditions,
        },
      },
      include: {
        shift: true,
        employee: {
          include: {
            user: {
              select: {
                id: true,
                role: true,
                email: true,
                telegramChatId: true,
                zaloUserId: true,
                notificationPreferences: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (assignments.length === 0) {
      return {
        checkedAssignments: 0,
        dueReminders: 0,
        createdInApp: 0,
        skippedDuplicates: 0,
        insertedDedupeKeys: [],
        externalDispatched: 0,
      };
    }

    const employeeIds = Array.from(
      new Set(assignments.map((a) => a.employeeId)),
    );
    const minStartAt = assignments.reduce(
      (min, a) => (a.shift.startAt < min ? a.shift.startAt : min),
      assignments[0]!.shift.startAt,
    );
    const maxEndAt = assignments.reduce(
      (max, a) => (a.shift.endAt > max ? a.shift.endAt : max),
      assignments[0]!.shift.endAt,
    );

    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: "APPROVED",
        startAt: { lt: maxEndAt },
        endAt: { gt: minStartAt },
      },
      select: {
        employeeId: true,
        startAt: true,
        endAt: true,
      },
    });

    const items: CandidateReminderItem[] = [];

    for (const assignment of assignments) {
      const { shift, employee } = assignment;
      if (
        !employee ||
        employee.status !== "ACTIVE" ||
        employee.deletedAt !== null ||
        !employee.user ||
        !employee.user.isActive
      ) {
        continue;
      }

      const hasOverlappingApprovedLeave = approvedLeaves.some(
        (leave) =>
          leave.employeeId === assignment.employeeId &&
          leave.startAt < shift.endAt &&
          leave.endAt > shift.startAt,
      );
      if (hasOverlappingApprovedLeave) {
        continue;
      }

      const recipient: NotificationRecipient = {
        userId: employee.user.id,
        fullName: employee.fullName,
        role: employee.user.role,
        email: employee.user.email,
        phone: employee.phone,
        telegramChatId: employee.user.telegramChatId,
        zaloUserId: employee.user.zaloUserId,
        preferences: normalizeNotificationPreferences(
          employee.user.notificationPreferences,
        ),
      };

      const startTimeStr = formatTimeVN(shift.startAt);
      const endTimeStr = formatTimeVN(shift.endAt);

      if (
        startLeadMs > 0 &&
        shift.startAt > now &&
        shift.startAt <= startUpper
      ) {
        const dedupeKey = `SHIFT_START:${shift.id}:${assignment.employeeId}`;
        items.push({
          dedupeKey,
          recipient,
          notification: {
            userId: employee.user.id,
            type: "SHIFT_REMINDER",
            title: "Nhắc nhở sắp vào ca làm việc",
            message: `Ca làm việc ${shift.name} (${startTimeStr}–${endTimeStr}) sẽ bắt đầu sau ít phút. Vui lòng chuẩn bị chấm công QR vào ca.`,
            linkUrl: "/employee/schedule",
            dedupeKey,
          },
        });
      }

      if (endLeadMs > 0 && shift.endAt > now && shift.endAt <= endUpper) {
        const dedupeKey = `SHIFT_END:${shift.id}:${assignment.employeeId}`;
        items.push({
          dedupeKey,
          recipient,
          notification: {
            userId: employee.user.id,
            type: "SHIFT_REMINDER",
            title: "Nhắc nhở chuẩn bị bàn giao & tan ca",
            message: `Ca làm việc ${shift.name} (${startTimeStr}–${endTimeStr}) sắp kết thúc. Vui lòng hoàn tất Biên bản bàn giao 8 bước & Checklist Daily trước khi chấm công ra.`,
            linkUrl: "/employee/handover",
            dedupeKey,
          },
        });
      }
    }

    if (items.length === 0) {
      return {
        checkedAssignments: assignments.length,
        dueReminders: 0,
        createdInApp: 0,
        skippedDuplicates: 0,
        insertedDedupeKeys: [],
        externalDispatched: 0,
      };
    }

    const report = await createNotificationsWithDedupeReport(
      prisma,
      items.map((i) => i.notification),
    );
    const insertedSet = new Set(report.insertedDedupeKeys);
    const newlyInsertedItems = items.filter((item) =>
      insertedSet.has(item.dedupeKey),
    );

    let externalDispatched = 0;
    for (const item of newlyInsertedItems) {
      try {
        const dispatchSummary = await dispatchExternalNotifications(
          {
            eventType: "SHIFT_REMINDER",
            title: item.notification.title,
            message: item.notification.message,
            linkUrl: item.notification.linkUrl,
            dedupeKey: item.dedupeKey,
            recipients: [item.recipient],
            policy,
          },
          deps,
        );
        externalDispatched += dispatchSummary.sent;
      } catch {
        // Swallow external channel errors so reminder processing never throws
      }
    }

    return {
      checkedAssignments: assignments.length,
      dueReminders: items.length,
      createdInApp: report.insertedDedupeKeys.length,
      skippedDuplicates: items.length - report.insertedDedupeKeys.length,
      insertedDedupeKeys: report.insertedDedupeKeys,
      externalDispatched,
    };
  },
};
