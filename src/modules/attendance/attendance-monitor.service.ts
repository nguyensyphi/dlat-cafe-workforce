import { formatIsoDateOnly, formatTimeVN, parseDateOnlyUtc, todayDateStringVN } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { loadSettingsBundle } from "@/modules/settings/settings.service";
import type {
  ChannelTransportDeps,
  NotificationRecipient,
} from "@/modules/notifications/channels/types";
import { dispatchExternalNotifications } from "@/modules/notifications/dispatcher";
import {
  createNotificationsWithDedupeReport,
  type NotificationMessage,
} from "@/modules/notifications/notification.service";
import { normalizeNotificationPreferences } from "@/modules/notifications/notification.validation";

export const MISSING_CLOCK_OUT_THRESHOLD_MINUTES = 60;
export const LATE_OR_NO_SHOW_THRESHOLD_MINUTES = 15;
const LATE_SCAN_LOOKBACK_HOURS = 16;

export interface AttendanceMonitorOptions {
  now?: Date;
  missingClockOutThresholdMinutes?: number;
  lateThresholdMinutes?: number;
}

export interface MissingClockOutScanSummary {
  checkedAttendances: number;
  newlyFlaggedCount: number;
  notificationsCreated: number;
  skippedDuplicates: number;
  insertedDedupeKeys: string[];
  externalDispatched: number;
}

export interface LateOrNoShowScanSummary {
  checkedAssignments: number;
  detectedLateOrNoShow: number;
  notificationsCreated: number;
  skippedDuplicates: number;
  insertedDedupeKeys: string[];
  externalDispatched: number;
}

export interface AttendanceMonitorCombinedSummary {
  ranAt: string;
  missingClockOut: MissingClockOutScanSummary;
  lateOrNoShow: LateOrNoShowScanSummary;
}

export interface MissingClockOutAlertDto {
  attendanceId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePhone: string;
  shiftId: string;
  shiftName: string;
  workDate: string;
  clockIn: string;
  shiftStartAt: string;
  shiftEndAt: string;
  suggestedClockOut: string;
  minutesOverdue: number;
  isFlagged: boolean;
}

export interface LateNoShowAlertDto {
  assignmentId: string;
  shiftId: string;
  shiftName: string;
  workDate: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePhone: string;
  positionName: string;
  shiftStartAt: string;
  shiftEndAt: string;
  minutesLate: number;
  severity: "LATE" | "NO_SHOW";
}

export interface ActiveAttendanceAlertsDto {
  missingClockOuts: MissingClockOutAlertDto[];
  lateOrNoShows: LateNoShowAlertDto[];
}

interface CandidateAlertNotification {
  dedupeKey: string;
  notification: NotificationMessage;
  recipient: NotificationRecipient;
}

async function loadActiveManagerRecipients(): Promise<
  Array<NotificationRecipient & { userId: string }>
> {
  const managers = await prisma.user.findMany({
    where: {
      role: { in: ["OWNER", "MANAGER"] },
      isActive: true,
    },
    select: {
      id: true,
      role: true,
      email: true,
      telegramChatId: true,
      zaloUserId: true,
      notificationPreferences: true,
      employee: {
        select: { fullName: true, phone: true },
      },
    },
  });

  return managers.map((mgr) => ({
    userId: mgr.id,
    fullName: mgr.employee?.fullName ?? mgr.email,
    role: mgr.role,
    email: mgr.email,
    phone: mgr.employee?.phone ?? null,
    telegramChatId: mgr.telegramChatId,
    zaloUserId: mgr.zaloUserId,
    preferences: normalizeNotificationPreferences(mgr.notificationPreferences),
  }));
}

export const attendanceMonitorService = {
  /**
   * Scans attendances where employee clocked in, did NOT clock out, and shift ended >= 60 minutes ago.
   * Marks them `isMissingClockOut = true`, `anomalyStatus = MISSING_CLOCK_OUT`, `completionStatus = INCOMPLETE`,
   * and sends idempotent in-app + external alerts to Employee and Owners/Managers.
   */
  async scanMissingClockOut(
    options?: AttendanceMonitorOptions,
    deps: ChannelTransportDeps = {},
  ): Promise<MissingClockOutScanSummary> {
    const now = options?.now ?? new Date();
    const thresholdMinutes =
      options?.missingClockOutThresholdMinutes ??
      MISSING_CLOCK_OUT_THRESHOLD_MINUTES;
    const cutoffEndAt = new Date(now.getTime() - thresholdMinutes * 60_000);

    const openAttendances = await prisma.attendance.findMany({
      where: {
        clockIn: { not: null },
        clockOut: null,
        shiftId: { not: null },
        employee: {
          status: "ACTIVE",
          deletedAt: null,
        },
        shift: {
          status: { not: "CANCELLED" },
          endAt: { lte: cutoffEndAt },
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

    if (openAttendances.length === 0) {
      return {
        checkedAttendances: 0,
        newlyFlaggedCount: 0,
        notificationsCreated: 0,
        skippedDuplicates: 0,
        insertedDedupeKeys: [],
        externalDispatched: 0,
      };
    }

    const [bundle, managerRecipients] = await Promise.all([
      loadSettingsBundle(),
      loadActiveManagerRecipients(),
    ]);
    const policy = bundle.notificationPolicy;

    let newlyFlaggedCount = 0;
    const candidates: CandidateAlertNotification[] = [];

    for (const att of openAttendances) {
      if (!att.shift || !att.clockIn) continue;

      if (
        !att.isMissingClockOut ||
        att.anomalyStatus !== "MISSING_CLOCK_OUT" ||
        att.completionStatus !== "INCOMPLETE"
      ) {
        await prisma.attendance.update({
          where: { id: att.id },
          data: {
            isMissingClockOut: true,
            anomalyStatus: "MISSING_CLOCK_OUT",
            completionStatus: "INCOMPLETE",
          },
        });
        newlyFlaggedCount += 1;
      }

      const startStr = formatTimeVN(att.shift.startAt);
      const endStr = formatTimeVN(att.shift.endAt);
      const clockInStr = formatTimeVN(att.clockIn);
      const overdueMin = Math.max(
        thresholdMinutes,
        Math.floor((now.getTime() - att.shift.endAt.getTime()) / 60_000),
      );

      // 1. Notify Employee
      if (att.employee.user && att.employee.user.isActive) {
        const empDedupeKey = `MISSING_CLOCK_OUT:EMP:${att.id}`;
        const empRecipient: NotificationRecipient = {
          userId: att.employee.user.id,
          fullName: att.employee.fullName,
          role: att.employee.user.role,
          email: att.employee.user.email,
          phone: att.employee.phone,
          telegramChatId: att.employee.user.telegramChatId,
          zaloUserId: att.employee.user.zaloUserId,
          preferences: normalizeNotificationPreferences(
            att.employee.user.notificationPreferences,
          ),
        };
        candidates.push({
          dedupeKey: empDedupeKey,
          recipient: empRecipient,
          notification: {
            userId: att.employee.user.id,
            type: "ATTENDANCE_ANOMALY",
            title: "Nhắc nhở: Bạn quên chấm công ra ca",
            message: `Ca ${att.shift.name} (${startStr}–${endStr}) đã kết thúc quá ${overdueMin} phút nhưng hệ thống chưa ghi nhận giờ ra (bạn đã vào ca lúc ${clockInStr}). Vui lòng liên hệ Chủ quán để cập nhật giờ ra.`,
            linkUrl: "/employee/attendance",
            dedupeKey: empDedupeKey,
          },
        });
      }

      // 2. Notify Owners & Managers
      for (const mgr of managerRecipients) {
        const mgrDedupeKey = `MISSING_CLOCK_OUT:MGR:${att.id}:${mgr.userId}`;
        candidates.push({
          dedupeKey: mgrDedupeKey,
          recipient: mgr,
          notification: {
            userId: mgr.userId,
            type: "ATTENDANCE_ANOMALY",
            title: "Cảnh báo: Nhân viên quên chấm công ra",
            message: `${att.employee.fullName} (${att.employee.employeeCode}) đã vào ca ${att.shift.name} (${startStr}–${endStr}) lúc ${clockInStr} nhưng quá ${overdueMin} phút sau tan ca vẫn chưa chấm công ra. Vào mục Chấm công để sửa giờ ra 1 chạm.`,
            linkUrl: "/attendance",
            dedupeKey: mgrDedupeKey,
          },
        });
      }
    }

    if (candidates.length === 0) {
      return {
        checkedAttendances: openAttendances.length,
        newlyFlaggedCount,
        notificationsCreated: 0,
        skippedDuplicates: 0,
        insertedDedupeKeys: [],
        externalDispatched: 0,
      };
    }

    const report = await createNotificationsWithDedupeReport(
      prisma,
      candidates.map((c) => c.notification),
    );
    const insertedSet = new Set(report.insertedDedupeKeys);
    const newlyInserted = candidates.filter((c) => insertedSet.has(c.dedupeKey));

    let externalDispatched = 0;
    for (const item of newlyInserted) {
      try {
        const dispatchSummary = await dispatchExternalNotifications(
          {
            eventType: "ATTENDANCE_ANOMALY",
            title: item.notification.title,
            message: item.notification.message,
            linkUrl: item.notification.linkUrl ?? "/attendance",
            dedupeKey: item.dedupeKey,
            recipients: [item.recipient],
            policy,
          },
          deps,
        );
        externalDispatched += dispatchSummary.sent;
      } catch {
        // Swallow external channel errors so background scan never throws
      }
    }

    return {
      checkedAttendances: openAttendances.length,
      newlyFlaggedCount,
      notificationsCreated: report.insertedDedupeKeys.length,
      skippedDuplicates: candidates.length - report.insertedDedupeKeys.length,
      insertedDedupeKeys: report.insertedDedupeKeys,
      externalDispatched,
    };
  },

  /**
   * Scans shift assignments where shift started >= 15 minutes ago (within the current 16h window),
   * employee has NOT clocked in, and has NO overlapping APPROVED leave request.
   * Sends idempotent alerts to active Owners/Managers.
   */
  async scanLateOrNoShow(
    options?: AttendanceMonitorOptions,
    deps: ChannelTransportDeps = {},
  ): Promise<LateOrNoShowScanSummary> {
    const now = options?.now ?? new Date();
    const thresholdMinutes =
      options?.lateThresholdMinutes ?? LATE_OR_NO_SHOW_THRESHOLD_MINUTES;
    const latestEligibleStartAt = new Date(
      now.getTime() - thresholdMinutes * 60_000,
    );
    const earliestEligibleStartAt = new Date(
      now.getTime() - LATE_SCAN_LOOKBACK_HOURS * 60 * 60_000,
    );

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
          startAt: {
            gte: earliestEligibleStartAt,
            lte: latestEligibleStartAt,
          },
        },
      },
      include: {
        shift: true,
        position: { select: { name: true } },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            phone: true,
          },
        },
      },
    });

    if (assignments.length === 0) {
      return {
        checkedAssignments: 0,
        detectedLateOrNoShow: 0,
        notificationsCreated: 0,
        skippedDuplicates: 0,
        insertedDedupeKeys: [],
        externalDispatched: 0,
      };
    }

    const employeeIds = Array.from(new Set(assignments.map((a) => a.employeeId)));
    const shiftIds = Array.from(new Set(assignments.map((a) => a.shiftId)));
    const minStartAt = assignments.reduce(
      (min, a) => (a.shift.startAt < min ? a.shift.startAt : min),
      assignments[0]!.shift.startAt,
    );
    const maxEndAt = assignments.reduce(
      (max, a) => (a.shift.endAt > max ? a.shift.endAt : max),
      assignments[0]!.shift.endAt,
    );

    const [attendances, approvedLeaves, bundle, managerRecipients] =
      await Promise.all([
        prisma.attendance.findMany({
          where: {
            employeeId: { in: employeeIds },
            shiftId: { in: shiftIds },
            clockIn: { not: null },
          },
          select: { employeeId: true, shiftId: true },
        }),
        prisma.leaveRequest.findMany({
          where: {
            employeeId: { in: employeeIds },
            status: "APPROVED",
            startAt: { lt: maxEndAt },
            endAt: { gt: minStartAt },
          },
          select: { employeeId: true, startAt: true, endAt: true },
        }),
        loadSettingsBundle(),
        loadActiveManagerRecipients(),
      ]);

    const clockedInSet = new Set(
      attendances.map((a) => `${a.employeeId}:${a.shiftId}`),
    );
    const policy = bundle.notificationPolicy;

    let detectedLateOrNoShow = 0;
    const candidates: CandidateAlertNotification[] = [];

    for (const assignment of assignments) {
      if (clockedInSet.has(`${assignment.employeeId}:${assignment.shiftId}`)) {
        continue;
      }

      const hasApprovedLeave = approvedLeaves.some(
        (leave) =>
          leave.employeeId === assignment.employeeId &&
          leave.startAt < assignment.shift.endAt &&
          leave.endAt > assignment.shift.startAt,
      );
      if (hasApprovedLeave) {
        continue;
      }

      detectedLateOrNoShow += 1;

      const startStr = formatTimeVN(assignment.shift.startAt);
      const endStr = formatTimeVN(assignment.shift.endAt);
      const minutesLate = Math.max(
        thresholdMinutes,
        Math.floor(
          (now.getTime() - assignment.shift.startAt.getTime()) / 60_000,
        ),
      );
      const isNoShow = now.getTime() >= assignment.shift.endAt.getTime();
      const label = isNoShow
        ? "vắng mặt không phép"
        : `đi trễ ${minutesLate} phút chưa chấm công`;

      for (const mgr of managerRecipients) {
        const dedupeKey = `LATE_NO_SHOW:MGR:${assignment.shiftId}:${assignment.employeeId}:${mgr.userId}`;
        candidates.push({
          dedupeKey,
          recipient: mgr,
          notification: {
            userId: mgr.userId,
            type: "ATTENDANCE_ANOMALY",
            title: isNoShow
              ? "Cảnh báo vắng mặt không phép"
              : "Cảnh báo nhân viên đi trễ / chưa vào ca",
            message: `${assignment.employee.fullName} (${assignment.employee.employeeCode}, vị trí ${assignment.position.name}) được phân ca ${assignment.shift.name} (${startStr}–${endStr}) nhưng ${label}. SĐT: ${assignment.employee.phone}.`,
            linkUrl: "/attendance",
            dedupeKey,
          },
        });
      }
    }

    if (candidates.length === 0) {
      return {
        checkedAssignments: assignments.length,
        detectedLateOrNoShow,
        notificationsCreated: 0,
        skippedDuplicates: 0,
        insertedDedupeKeys: [],
        externalDispatched: 0,
      };
    }

    const report = await createNotificationsWithDedupeReport(
      prisma,
      candidates.map((c) => c.notification),
    );
    const insertedSet = new Set(report.insertedDedupeKeys);
    const newlyInserted = candidates.filter((c) => insertedSet.has(c.dedupeKey));

    let externalDispatched = 0;
    for (const item of newlyInserted) {
      try {
        const dispatchSummary = await dispatchExternalNotifications(
          {
            eventType: "ATTENDANCE_ANOMALY",
            title: item.notification.title,
            message: item.notification.message,
            linkUrl: item.notification.linkUrl ?? "/attendance",
            dedupeKey: item.dedupeKey,
            recipients: [item.recipient],
            policy,
          },
          deps,
        );
        externalDispatched += dispatchSummary.sent;
      } catch {
        // Swallow external channel errors
      }
    }

    return {
      checkedAssignments: assignments.length,
      detectedLateOrNoShow,
      notificationsCreated: report.insertedDedupeKeys.length,
      skippedDuplicates: candidates.length - report.insertedDedupeKeys.length,
      insertedDedupeKeys: report.insertedDedupeKeys,
      externalDispatched,
    };
  },

  async runAttendanceAnomalyMonitor(
    options?: AttendanceMonitorOptions,
    deps: ChannelTransportDeps = {},
  ): Promise<AttendanceMonitorCombinedSummary> {
    const now = options?.now ?? new Date();
    const [missingClockOut, lateOrNoShow] = await Promise.all([
      this.scanMissingClockOut({ ...options, now }, deps),
      this.scanLateOrNoShow({ ...options, now }, deps),
    ]);
    return {
      ranAt: now.toISOString(),
      missingClockOut,
      lateOrNoShow,
    };
  },

  /**
   * Returns live operational alerts for /dashboard and /attendance:
   * - Missing clock-out attendances (either already flagged or shift ended >= 60m ago without clockOut)
   * - Late / No-show shift assignments for the selected date (or today) where startAt <= now - 15m
   */
  async getActiveAttendanceAlerts(options?: {
    now?: Date;
    workDate?: string;
  }): Promise<ActiveAttendanceAlertsDto> {
    const now = options?.now ?? new Date();
    const targetDateIso = options?.workDate ?? todayDateStringVN(now);
    const targetDateUtc = parseDateOnlyUtc(targetDateIso);
    const missingCutoff = new Date(
      now.getTime() - MISSING_CLOCK_OUT_THRESHOLD_MINUTES * 60_000,
    );
    const lateCutoff = new Date(
      now.getTime() - LATE_OR_NO_SHOW_THRESHOLD_MINUTES * 60_000,
    );

    const [openAttendances, assignments] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          clockIn: { not: null },
          clockOut: null,
          shiftId: { not: null },
          employee: { status: "ACTIVE", deletedAt: null },
          OR: [
            { isMissingClockOut: true },
            {
              shift: {
                status: { not: "CANCELLED" },
                endAt: { lte: missingCutoff },
              },
            },
          ],
        },
        include: {
          shift: true,
          employee: {
            select: {
              id: true,
              employeeCode: true,
              fullName: true,
              phone: true,
            },
          },
        },
        orderBy: { clockIn: "desc" },
        take: 30,
      }),
      prisma.shiftAssignment.findMany({
        where: {
          status: "ASSIGNED",
          employee: {
            status: "ACTIVE",
            deletedAt: null,
            user: { isActive: true },
          },
          shift: {
            workDate: targetDateUtc,
            status: { not: "CANCELLED" },
            schedule: { status: { in: ["PUBLISHED", "LOCKED"] } },
            startAt: { lte: lateCutoff },
          },
        },
        include: {
          shift: true,
          position: { select: { name: true } },
          employee: {
            select: {
              id: true,
              employeeCode: true,
              fullName: true,
              phone: true,
            },
          },
        },
        orderBy: { shift: { startAt: "asc" } },
      }),
    ]);

    const missingClockOuts: MissingClockOutAlertDto[] = openAttendances
      .filter((a) => a.shift !== null && a.clockIn !== null)
      .map((a) => {
        const shift = a.shift!;
        const minutesOverdue = Math.max(
          0,
          Math.floor((now.getTime() - shift.endAt.getTime()) / 60_000),
        );
        return {
          attendanceId: a.id,
          employeeId: a.employee.id,
          employeeCode: a.employee.employeeCode,
          employeeName: a.employee.fullName,
          employeePhone: a.employee.phone,
          shiftId: shift.id,
          shiftName: shift.name,
          workDate: formatIsoDateOnly(a.workDate),
          clockIn: a.clockIn!.toISOString(),
          shiftStartAt: shift.startAt.toISOString(),
          shiftEndAt: shift.endAt.toISOString(),
          suggestedClockOut: shift.endAt.toISOString(),
          minutesOverdue,
          isFlagged: a.isMissingClockOut,
        };
      });

    let lateOrNoShows: LateNoShowAlertDto[] = [];
    if (assignments.length > 0) {
      const empIds = Array.from(new Set(assignments.map((a) => a.employeeId)));
      const shiftIds = Array.from(new Set(assignments.map((a) => a.shiftId)));
      const minStartAt = assignments.reduce(
        (min, a) => (a.shift.startAt < min ? a.shift.startAt : min),
        assignments[0]!.shift.startAt,
      );
      const maxEndAt = assignments.reduce(
        (max, a) => (a.shift.endAt > max ? a.shift.endAt : max),
        assignments[0]!.shift.endAt,
      );

      const [clockedAttendances, approvedLeaves] = await Promise.all([
        prisma.attendance.findMany({
          where: {
            employeeId: { in: empIds },
            shiftId: { in: shiftIds },
            clockIn: { not: null },
          },
          select: { employeeId: true, shiftId: true },
        }),
        prisma.leaveRequest.findMany({
          where: {
            employeeId: { in: empIds },
            status: "APPROVED",
            startAt: { lt: maxEndAt },
            endAt: { gt: minStartAt },
          },
          select: { employeeId: true, startAt: true, endAt: true },
        }),
      ]);

      const clockedSet = new Set(
        clockedAttendances.map((a) => `${a.employeeId}:${a.shiftId}`),
      );

      lateOrNoShows = assignments
        .filter((a) => {
          if (clockedSet.has(`${a.employeeId}:${a.shiftId}`)) return false;
          const hasLeave = approvedLeaves.some(
            (l) =>
              l.employeeId === a.employeeId &&
              l.startAt < a.shift.endAt &&
              l.endAt > a.shift.startAt,
          );
          return !hasLeave;
        })
        .map((a) => {
          const minutesLate = Math.max(
            LATE_OR_NO_SHOW_THRESHOLD_MINUTES,
            Math.floor((now.getTime() - a.shift.startAt.getTime()) / 60_000),
          );
          const severity: "LATE" | "NO_SHOW" =
            now.getTime() >= a.shift.endAt.getTime() ? "NO_SHOW" : "LATE";
          return {
            assignmentId: a.id,
            shiftId: a.shift.id,
            shiftName: a.shift.name,
            workDate: formatIsoDateOnly(a.shift.workDate),
            employeeId: a.employee.id,
            employeeCode: a.employee.employeeCode,
            employeeName: a.employee.fullName,
            employeePhone: a.employee.phone,
            positionName: a.position.name,
            shiftStartAt: a.shift.startAt.toISOString(),
            shiftEndAt: a.shift.endAt.toISOString(),
            minutesLate,
            severity,
          };
        });
    }

    return {
      missingClockOuts,
      lateOrNoShows,
    };
  },
};
