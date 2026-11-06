import type {
  EmployeeStatus,
  SkillProficiency,
  UserRole,
} from "@prisma/client";

export interface EmployeeSkillDto {
  positionId: string;
  positionCode: string;
  positionName: string;
  proficiency: SkillProficiency;
}

export interface PayRateDto {
  id: string;
  hourlyRate: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdAt: string;
}

export interface EmploymentHistoryDto {
  id: string;
  eventType: string;
  effectiveDate: string;
  summary: string;
  recordedByEmail: string | null;
  createdAt: string;
}

export interface EmployeeSummaryDto {
  id: string;
  userId: string;
  employeeCode: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string;
  email: string;
  role: UserRole;
  hireDate: string;
  status: EmployeeStatus;
  primaryPosition: {
    id: string;
    code: string;
    name: string;
  };
  skills: EmployeeSkillDto[];
  weeklyTargetHours: number;
  maxWeeklyHours: number;
  fixedRestDay: number | null;
  currentHourlyRate: string;
}

export interface EmployeeDetailDto extends EmployeeSummaryDto {
  dateOfBirth: string | null;
  terminationDate: string | null;
  internalNotes: string | null;
  payRates: PayRateDto[];
  employmentHistory: EmploymentHistoryDto[];
}

export interface ListEmployeesFilter {
  search?: string;
  status?: EmployeeStatus | "ALL";
  positionId?: string;
}

