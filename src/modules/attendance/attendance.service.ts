import QRCode from "qrcode";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  formatIsoDateOnly,
  formatTimeVN,
  parseDateOnlyUtc,
  todayDateStringVN,
} from "@/lib/date";
import {
  AppForbiddenError,
  AppNotFoundError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import { parseOrThrow } from "@/lib/validation";
import { recordAuditLog } from "@/modules/audit/audit.service";
import {
  calculateAttendanceTimes,
  calculateLateAndEarlyMinutes,
  minutesToDecimalHours,
  type EventItem,
} from "./attendance-calculator";
import {
  generateSecureToken,
  hashSecureToken,
  isTokenExpired,
} from "./qr-token";
import type {
  AttendanceDto,
  AttendanceEventDto,
  AttendanceScanResultDto,
  KioskTokenDto,
} from "./attendance.types";
import {
  manualAdjustAttendanceSchema,
  scanQrAttendanceSchema,
} from "./attendance.validation";

type AttendanceWithRelations = Prisma.AttendanceGetPayload<{
  include: {
    employee: { select: { fullName: true; employeeCode: true } };
    shift: { select: { name: true } };
    approvedBy: {
      select: { email: true; employee: { select: { fullName: true } } };
    };
    events: true;
  };
}>;

export class AttendanceService {
  /**
   * Generates a dynamic single-use or time-bounded QR token for the Kiosk screen.
   * Only valid for 45 seconds to strictly prevent replay and remote sharing.
   */
  async generateKioskToken(actor: SessionUser): Promise<KioskTokenDto> {
    assertPermission(actor.role, "attendance:manage");

    const token = generateSecureToken();
    const tokenHash = hashSecureToken(token);
    const expiresAt = new Date(Date.now() + 45_000); // 45 seconds

    await prisma.attendanceSession.create({
      data: {
        tokenHash,
        expiresAt,
        createdById: actor.userId,
      },
    });

    const qrDataUrl = await QRCode.toDataURL(token, {
      margin: 2,
      scale: 8,
      errorCorrectionLevel: "M",
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      qrDataUrl,
    };
  }

  /**
   * Records an employee scanning the kiosk QR code.
   * Strictly enforces:
   * 1. Token validity and expiration (30-60s)
   * 2. Per-employee anti-replay check
   * 3. Server timestamps only
   * 4. State validation (CLOCK_IN -> [BREAK_START -> BREAK_END]* -> CLOCK_OUT)
   * 5. 4-tier hours calculation
   */
  async recordScan(
    actor: SessionUser,
    rawInput: unknown,
  ): Promise<AttendanceScanResultDto> {
    assertPermission(actor.role, "self:attendance");

    if (!actor.employeeId) {
      throw new AppForbiddenError("Tài khoản chưa được liên kết với hồ sơ nhân viên");
    }

    const input = parseOrThrow(scanQrAttendanceSchema, rawInput);

    const tokenHash = hashSecureToken(input.token);
    const now = new Date();

    // 1. Verify token session
    const session = await prisma.attendanceSession.findUnique({
      where: { tokenHash },
    });

    if (!session || isTokenExpired(session.expiresAt, now)) {
      throw new AppValidationError(
        "Mã QR đã hết hạn hoặc không hợp lệ. Vui lòng quét mã mới nhất trên màn hình Kiosk.",
      );
    }

    // 2. Anti-replay check per employee
    const replayCheck = await prisma.attendanceEvent.findFirst({
      where: {
        sessionId: session.id,
        recordedById: actor.userId,
      },
    });

    if (replayCheck) {
      throw new AppValidationError(
        "Bạn đã sử dụng mã QR này rồi. Vui lòng chờ mã mới xuất hiện trên màn hình Kiosk.",
      );
    }

    // 3. Employee & today's assigned shift
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: actor.employeeId },
      select: { id: true, fullName: true, employeeCode: true },
    });

    const todayStr = todayDateStringVN(now);
    const workDate = parseDateOnlyUtc(todayStr);

    // Look for active shift assignment for today
    const assignment = await prisma.shiftAssignment.findFirst({
      where: {
        employeeId: employee.id,
        status: "ASSIGNED",
        shift: {
          workDate,
          schedule: {
            status: "PUBLISHED",
          },
        },
      },
      include: {
        shift: true,
      },
      orderBy: {
        shift: {
          startAt: "asc",
        },
      },
    });

    const shift = assignment?.shift ?? null;

    // 4. Find or prepare existing attendance record for today
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        workDate,
        ...(shift ? { shiftId: shift.id } : {}),
      },
      include: {
        events: {
          orderBy: { occurredAt: "asc" },
        },
      },
    });

    const pastEvents = existingAttendance?.events ?? [];
    const lastEvent = pastEvents[pastEvents.length - 1];

    // 5. State validations
    if (input.eventType === "CLOCK_IN") {
      if (existingAttendance?.clockIn && !existingAttendance.clockOut) {
        throw new AppValidationError(
          `Bạn đã vào ca lúc ${formatTimeVN(existingAttendance.clockIn)} rồi. Vui lòng không chấm vào ca 2 lần!`,
        );
      }
      if (existingAttendance?.clockOut) {
        throw new AppValidationError(
          `Bạn đã hoàn thành ca làm việc lúc ${formatTimeVN(existingAttendance.clockOut)} rồi!`,
        );
      }
    } else if (input.eventType === "BREAK_START") {
      if (!existingAttendance?.clockIn) {
        throw new AppValidationError("Bạn chưa chấm vào ca làm việc.");
      }
      if (existingAttendance.clockOut) {
        throw new AppValidationError("Ca làm việc đã kết thúc.");
      }
      if (lastEvent?.eventType === "BREAK_START") {
        throw new AppValidationError("Bạn đang trong thời gian nghỉ giữa ca rồi.");
      }
    } else if (input.eventType === "BREAK_END") {
      if (lastEvent?.eventType !== "BREAK_START") {
        throw new AppValidationError("Bạn chưa bắt đầu nghỉ giữa ca.");
      }
    } else if (input.eventType === "CLOCK_OUT") {
      if (!existingAttendance?.clockIn) {
        throw new AppValidationError("Bạn chưa chấm vào ca làm việc hôm nay.");
      }
      if (existingAttendance.clockOut) {
        throw new AppValidationError("Bạn đã hoàn thành chấm tan ca rồi.");
      }
    }

    // 6. Execute atomic persistence
    const result = await prisma.$transaction(async (tx) => {
      // Create event record
      let attendanceId = existingAttendance?.id;

      if (!attendanceId) {
        const scheduledMinutes = shift
          ? Math.max(
              0,
              Math.floor((shift.endAt.getTime() - shift.startAt.getTime()) / 60_000) -
                shift.breakMinutes,
            )
          : 0;

        const createdAtt = await tx.attendance.create({
          data: {
            employeeId: employee.id,
            shiftId: shift?.id ?? null,
            workDate,
            scheduledMinutes,
            status: "PENDING",
            source: "QR",
          },
        });
        attendanceId = createdAtt.id;
      }

      await tx.attendanceEvent.create({
        data: {
          attendanceId,
          sessionId: session.id,
          eventType: input.eventType,
          occurredAt: now,
          source: "QR",
          recordedById: actor.userId,
          note: input.note ?? null,
        },
      });

      // Fetch all events including newly inserted
      const allEvents = await tx.attendanceEvent.findMany({
        where: { attendanceId },
        orderBy: { occurredAt: "asc" },
      });

      const eventItems: EventItem[] = allEvents.map((e) => ({
        eventType: e.eventType,
        occurredAt: e.occurredAt,
      }));

      const scheduledMinutes = shift
        ? Math.max(
            0,
            Math.floor((shift.endAt.getTime() - shift.startAt.getTime()) / 60_000) -
              shift.breakMinutes,
          )
        : existingAttendance?.scheduledMinutes ?? 0;

      const calc = calculateAttendanceTimes({
        events: eventItems,
        scheduledMinutes,
        shiftEnd: shift?.endAt ?? null,
        currentTime: now,
      });

      // Calculate late / early leave if shift exists
      let lateMinutes = 0;
      let earlyLeaveMinutes = 0;
      if (shift && calc.clockIn) {
        const lateEarly = calculateLateAndEarlyMinutes({
          shiftStart: shift.startAt,
          shiftEnd: shift.endAt,
          clockIn: calc.clockIn,
          clockOut: calc.clockOut,
          graceMinutes: 5,
        });
        lateMinutes = lateEarly.lateMinutes;
        earlyLeaveMinutes = lateEarly.earlyLeaveMinutes;
      }

      // Update Attendance header record
      const updated = await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          clockIn: calc.clockIn,
          clockOut: calc.clockOut,
          breakMinutes: calc.breakMinutes,
          workedMinutes: calc.workedMinutes,
          approvedMinutes: calc.approvedMinutes,
          paidMinutes: calc.paidMinutes,
          lateMinutes,
          earlyLeaveMinutes,
          isMissingClockOut: calc.isMissingClockOut,
        },
      });

      return {
        attendance: updated,
        lastEventTime: now,
      };
    });

    const isNowOnBreak = input.eventType === "BREAK_START";
    const eventLabels: Record<string, string> = {
      CLOCK_IN: "Vào ca thành công",
      BREAK_START: "Bắt đầu nghỉ giữa ca",
      BREAK_END: "Kết thúc nghỉ, tiếp tục làm việc",
      CLOCK_OUT: "Tan ca thành công",
    };

    return {
      attendanceId: result.attendance.id,
      eventType: input.eventType,
      occurredAt: result.lastEventTime.toISOString(),
      employeeName: employee.fullName,
      message: `${eventLabels[input.eventType] ?? "Ghi nhận thành công"} (${formatTimeVN(now)})`,
      currentStatus: {
        clockIn: result.attendance.clockIn
          ? result.attendance.clockIn.toISOString()
          : null,
        clockOut: result.attendance.clockOut
          ? result.attendance.clockOut.toISOString()
          : null,
        workedMinutes: result.attendance.workedMinutes,
        breakMinutes: result.attendance.breakMinutes,
        isOnBreak: isNowOnBreak,
      },
    };
  }

  /**
   * Lists attendances for manager/owner review with 4-tier hours and filters.
   */
  async listAttendances(
    actor: SessionUser,
    filters: {
      workDate?: string;
      startDate?: string;
      endDate?: string;
      status?: "PENDING" | "APPROVED" | "REJECTED";
      employeeId?: string;
    } = {},
  ): Promise<AttendanceDto[]> {
    assertPermission(actor.role, "attendance:manage");

    const where: Prisma.AttendanceWhereInput = {};

    if (filters.employeeId) {
      where.employeeId = filters.employeeId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.workDate) {
      where.workDate = parseDateOnlyUtc(filters.workDate);
    } else if (filters.startDate || filters.endDate) {
      where.workDate = {};
      if (filters.startDate) {
        where.workDate.gte = parseDateOnlyUtc(filters.startDate);
      }
      if (filters.endDate) {
        where.workDate.lte = parseDateOnlyUtc(filters.endDate);
      }
    }

    const rows = await prisma.attendance.findMany({
      where,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: {
        employee: {
          select: { fullName: true, employeeCode: true },
        },
        shift: {
          select: { name: true },
        },
        approvedBy: {
          select: { email: true, employee: { select: { fullName: true } } },
        },
        events: {
          orderBy: { occurredAt: "asc" },
        },
      },
    });

    return rows.map((r) => this.mapToDto(r));
  }

  /**
   * Retrieves an employee's personal attendance records.
   */
  async getMyAttendances(
    actor: SessionUser,
    filters: { startDate?: string; endDate?: string } = {},
  ): Promise<AttendanceDto[]> {
    assertPermission(actor.role, "self:attendance");

    if (!actor.employeeId) {
      return [];
    }

    const where: Prisma.AttendanceWhereInput = {
      employeeId: actor.employeeId,
    };

    if (filters.startDate || filters.endDate) {
      where.workDate = {};
      if (filters.startDate) {
        where.workDate.gte = parseDateOnlyUtc(filters.startDate);
      }
      if (filters.endDate) {
        where.workDate.lte = parseDateOnlyUtc(filters.endDate);
      }
    }

    const rows = await prisma.attendance.findMany({
      where,
      orderBy: { workDate: "desc" },
      take: 60,
      include: {
        employee: {
          select: { fullName: true, employeeCode: true },
        },
        shift: {
          select: { name: true },
        },
        approvedBy: {
          select: { email: true, employee: { select: { fullName: true } } },
        },
        events: {
          orderBy: { occurredAt: "asc" },
        },
      },
    });

    return rows.map((r) => this.mapToDto(r));
  }

  /**
   * Gets today's attendance status for the current employee (used on mobile scanner page).
   */
  async getMyTodayStatus(actor: SessionUser) {
    assertPermission(actor.role, "self:attendance");

    if (!actor.employeeId) {
      return null;
    }

    const now = new Date();
    const todayStr = todayDateStringVN(now);
    const workDate = parseDateOnlyUtc(todayStr);

    const [attendance, assignment] = await Promise.all([
      prisma.attendance.findFirst({
        where: {
          employeeId: actor.employeeId,
          workDate,
        },
        include: {
          employee: {
            select: { fullName: true, employeeCode: true },
          },
          shift: {
            select: { name: true },
          },
          approvedBy: {
            select: { email: true, employee: { select: { fullName: true } } },
          },
          events: {
            orderBy: { occurredAt: "asc" },
          },
        },
      }),
      prisma.shiftAssignment.findFirst({
        where: {
          employeeId: actor.employeeId,
          status: "ASSIGNED",
          shift: {
            workDate,
            schedule: { status: "PUBLISHED" },
          },
        },
        include: { shift: true },
      }),
    ]);

    const events = attendance?.events ?? [];
    const lastEvent = events[events.length - 1];

    return {
      workDate: todayStr,
      assignedShift: assignment?.shift
        ? {
            id: assignment.shift.id,
            name: assignment.shift.name,
            startTime: formatTimeVN(assignment.shift.startAt),
            endTime: formatTimeVN(assignment.shift.endAt),
            breakMinutes: assignment.shift.breakMinutes,
          }
        : null,
      attendance: attendance ? this.mapToDto(attendance) : null,
      currentStatus: {
        hasClockedIn: Boolean(attendance?.clockIn),
        hasClockedOut: Boolean(attendance?.clockOut),
        isOnBreak: lastEvent?.eventType === "BREAK_START",
        clockInTime: attendance?.clockIn ? formatTimeVN(attendance.clockIn) : null,
        clockOutTime: attendance?.clockOut ? formatTimeVN(attendance.clockOut) : null,
        workedMinutes: attendance?.workedMinutes ?? 0,
        breakMinutes: attendance?.breakMinutes ?? 0,
      },
    };
  }

  /**
   * Manual correction / review of an attendance record by Manager/Owner.
   * Requires mandatory reason and logs an audit trail.
   */
  async manualAdjustAttendance(
    actor: SessionUser,
    attendanceId: string,
    rawInput: unknown,
  ): Promise<AttendanceDto> {
    assertPermission(actor.role, "attendance:manage");

    const input = parseOrThrow(
      manualAdjustAttendanceSchema,
      rawInput,
    );

    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        employee: { select: { fullName: true } },
      },
    });

    if (!existing) {
      throw new AppNotFoundError("Không tìm thấy bản ghi chấm công");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          approvedMinutes: input.approvedMinutes,
          paidMinutes: input.paidMinutes,
          status: input.status,
          adjustmentReason: input.adjustmentReason,
          approvedById: actor.userId,
          approvedAt: new Date(),
          source: "MANUAL",
          ...(input.clockIn ? { clockIn: new Date(input.clockIn) } : {}),
          ...(input.clockOut ? { clockOut: new Date(input.clockOut) } : {}),
        },
        include: {
          employee: { select: { fullName: true, employeeCode: true } },
          shift: { select: { name: true } },
          approvedBy: {
            select: { email: true, employee: { select: { fullName: true } } },
          },
          events: { orderBy: { occurredAt: "asc" } },
        },
      });

      await recordAuditLog({
        userId: actor.userId,
        action: "ATTENDANCE_CORRECTION",
        entityType: "Attendance",
        entityId: attendanceId,
        oldValues: {
          approvedMinutes: existing.approvedMinutes,
          paidMinutes: existing.paidMinutes,
          status: existing.status,
          adjustmentReason: existing.adjustmentReason,
        },
        newValues: {
          approvedMinutes: input.approvedMinutes,
          paidMinutes: input.paidMinutes,
          status: input.status,
          adjustmentReason: input.adjustmentReason,
        },
      });

      return row;
    });

    return this.mapToDto(updated);
  }

  private mapToDto(row: AttendanceWithRelations): AttendanceDto {
    const scheduledHours = minutesToDecimalHours(row.scheduledMinutes);
    const workedHours = minutesToDecimalHours(row.workedMinutes);
    const breakHours = minutesToDecimalHours(row.breakMinutes);
    const approvedHours =
      row.approvedMinutes !== null
        ? minutesToDecimalHours(row.approvedMinutes)
        : null;
    const paidHours =
      row.paidMinutes !== null ? minutesToDecimalHours(row.paidMinutes) : null;

    return {
      id: row.id,
      employeeId: row.employeeId,
      employeeName: row.employee?.fullName ?? "—",
      employeeCode: row.employee?.employeeCode ?? "—",
      shiftId: row.shiftId,
      shiftName: row.shift?.name ?? "Không theo ca",
      workDate: formatIsoDateOnly(row.workDate),
      clockIn: row.clockIn ? row.clockIn.toISOString() : null,
      clockOut: row.clockOut ? row.clockOut.toISOString() : null,
      scheduledMinutes: row.scheduledMinutes,
      scheduledHours,
      workedMinutes: row.workedMinutes,
      workedHours,
      breakMinutes: row.breakMinutes,
      breakHours,
      approvedMinutes: row.approvedMinutes,
      approvedHours,
      paidMinutes: row.paidMinutes,
      paidHours,
      lateMinutes: row.lateMinutes,
      earlyLeaveMinutes: row.earlyLeaveMinutes,
      overtimeMinutes: row.overtimeMinutes,
      isMissingClockOut: row.isMissingClockOut,
      status: row.status,
      source: row.source,
      adjustmentReason: row.adjustmentReason,
      approvedByName:
        row.approvedBy?.employee?.fullName ?? row.approvedBy?.email ?? null,
      events: (row.events ?? []).map((e): AttendanceEventDto => ({
        id: e.id,
        eventType: e.eventType,
        occurredAt: e.occurredAt.toISOString(),
        source: e.source,
        note: e.note,
      })),
    };
  }
}

export const attendanceService = new AttendanceService();
