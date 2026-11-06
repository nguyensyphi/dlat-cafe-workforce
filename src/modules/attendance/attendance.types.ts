import type {
  AttendanceEventType,
  AttendanceSource,
  AttendanceStatus,
} from "@prisma/client";

export interface AttendanceEventDto {
  id: string;
  eventType: AttendanceEventType;
  occurredAt: string;
  source: AttendanceSource;
  note: string | null;
}

export interface AttendanceDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  shiftId: string | null;
  shiftName: string | null;
  workDate: string; // YYYY-MM-DD
  clockIn: string | null;
  clockOut: string | null;
  scheduledMinutes: number;
  scheduledHours: number;
  workedMinutes: number;
  workedHours: number;
  breakMinutes: number;
  breakHours: number;
  approvedMinutes: number | null;
  approvedHours: number | null;
  paidMinutes: number | null;
  paidHours: number | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  isMissingClockOut: boolean;
  status: AttendanceStatus;
  source: AttendanceSource;
  adjustmentReason: string | null;
  approvedByName: string | null;
  events: AttendanceEventDto[];
}

export interface KioskTokenDto {
  token: string;
  expiresAt: string;
  qrDataUrl: string;
}

export interface AttendanceScanResultDto {
  attendanceId: string;
  eventType: AttendanceEventType;
  occurredAt: string;
  employeeName: string;
  message: string;
  currentStatus: {
    clockIn: string | null;
    clockOut: string | null;
    workedMinutes: number;
    breakMinutes: number;
    isOnBreak: boolean;
  };
}

