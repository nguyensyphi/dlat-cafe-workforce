import type {
  AssignmentEvaluation,
} from "./conflict-detector";
import type { ScheduleStatus, ShiftStatus } from "@prisma/client";

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã công bố",
  LOCKED: "Đã khóa",
  ARCHIVED: "Đã lưu trữ",
};

export interface AssignmentDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  positionId: string;
  positionName: string;
  isPinned: boolean;
  explanation: string | null;
}

export interface ShiftRequirementDto {
  positionId: string;
  positionName: string;
  minCount: number;
  maxCount: number | null;
  assignedCount: number;
}

export interface ScheduleShiftDto {
  id: string;
  scheduleId: string;
  templateId: string | null;
  name: string;
  /** YYYY-MM-DD (local work date) */
  workDate: string;
  startAt: string;
  endAt: string;
  /** HH:mm in Asia/Ho_Chi_Minh */
  startTime: string;
  endTime: string;
  breakMinutes: number;
  requiredStaff: number;
  maxStaff: number | null;
  isPeak: boolean;
  status: ShiftStatus;
  notes: string | null;
  netMinutes: number;
  assignedCount: number;
  requirements: ShiftRequirementDto[];
  assignments: AssignmentDto[];
}

export interface EmployeeWeekSummaryDto {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  primaryPositionId: string;
  primaryPositionName: string;
  weeklyTargetHours: number;
  maxWeeklyHours: number;
  assignedMinutes: number;
  shiftCount: number;
}

export interface ScheduleTotalsDto {
  shiftCount: number;
  requiredSlots: number;
  filledSlots: number;
  understaffedShiftCount: number;
  totalAssignedMinutes: number;
}

export interface ScheduleDetailDto {
  id: string;
  weekStart: string;
  weekEnd: string;
  name: string | null;
  status: ScheduleStatus;
  publishedAt: string | null;
  lockedAt: string | null;
  availabilityDeadline: string | null;
  notes: string | null;
  revisionCount: number;
  shifts: ScheduleShiftDto[];
  employeeSummaries: EmployeeWeekSummaryDto[];
  totals: ScheduleTotalsDto;
}

export interface ScheduleListItemDto {
  id: string;
  weekStart: string;
  status: ScheduleStatus;
  shiftCount: number;
}

export interface ScheduleRevisionDto {
  id: string;
  revisionNumber: number;
  action: string;
  summary: string;
  changedByName: string | null;
  createdAt: string;
}

export interface CandidateDto {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  primaryPositionName: string;
  suggestedPositionId: string;
  skillPositionIds: string[];
  alreadyAssigned: boolean;
  evaluation: AssignmentEvaluation;
}

export interface MyShiftDto {
  assignmentId: string;
  shiftId: string;
  shiftName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  netMinutes: number;
  positionName: string;
  coworkers: string[];
}

export interface MyWeekScheduleDto {
  weekStart: string;
  weekEnd: string;
  /** null when no official (published) schedule exists for the week */
  scheduleStatus: ScheduleStatus | null;
  shifts: MyShiftDto[];
  totalMinutes: number;
}

export type ScheduleStatusAction = "PUBLISH" | "LOCK" | "UNLOCK" | "ARCHIVE";

