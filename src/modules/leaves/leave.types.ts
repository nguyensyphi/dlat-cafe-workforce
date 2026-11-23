import type { LeaveStatus } from "@prisma/client";
import type { CandidateDto } from "@/modules/schedules/schedule.types";

export interface LeaveRequestDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  shiftId: string | null;
  shiftName: string | null;
  startAt: string;
  endAt: string;
  reason: string;
  isEmergency: boolean;
  status: LeaveStatus;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface AffectedShiftDto {
  shiftId: string;
  shiftName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  recommendedReplacements: CandidateDto[];
}

export interface LeaveReviewResultDto {
  leave: LeaveRequestDto;
  affectedShifts: AffectedShiftDto[];
}

