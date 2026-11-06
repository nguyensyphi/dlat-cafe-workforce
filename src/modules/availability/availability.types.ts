import type {
  AvailabilityPreference,
  AvailabilitySubmissionStatus,
} from "@prisma/client";

export interface AvailabilitySlotDto {
  templateId: string;
  templateCode: string;
  templateName: string;
  startTime: string;
  endTime: string;
  workDate: string;
  preference: AvailabilityPreference;
  note: string | null;
}

export interface DayAvailabilityDto {
  workDate: string;
  dayOfWeek: number;
  slots: AvailabilitySlotDto[];
}

export interface EmployeeWeekAvailabilityDto {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  weekStart: string;
  weekEnd: string;
  submissionStatus: AvailabilitySubmissionStatus;
  deadlinePassed: boolean;
  deadlineAt: string | null;
  days: DayAvailabilityDto[];
}

export interface AvailabilityOverviewItemDto {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  primaryPositionName: string;
  submissionStatus: AvailabilitySubmissionStatus;
  preferredCount: number;
  availableCount: number;
  unavailableCount: number;
  updatedAt: string | null;
}

export interface WeekAvailabilityOverviewDto {
  weekStart: string;
  weekEnd: string;
  deadlineAt: string | null;
  deadlinePassed: boolean;
  totalEmployees: number;
  submittedEmployees: number;
  employees: AvailabilityOverviewItemDto[];
}

