import type { SkillProficiency } from "@prisma/client";

export interface EngineShiftRequirement {
  positionId: string;
  minCount: number;
  maxCount: number | null;
}

export interface EngineShift {
  id: string;
  templateId: string | null;
  name: string;
  workDate: string; // YYYY-MM-DD
  startAt: Date;
  endAt: Date;
  breakMinutes: number;
  netMinutes: number;
  requiredStaff: number;
  maxStaff: number | null;
  priority: number;
  isPeak: boolean;
  requirements: EngineShiftRequirement[];
}

export interface EngineEmployee {
  id: string;
  fullName: string;
  employeeCode: string;
  primaryPositionId: string;
  status: string;
  weeklyTargetHours: number;
  maxWeeklyHours: number;
  hourlyRate: bigint;
  skills: Array<{
    positionId: string;
    proficiency: SkillProficiency;
  }>;
}

export interface EngineAvailability {
  employeeId: string;
  workDate: string; // YYYY-MM-DD
  templateId: string | null;
  startAt: Date;
  endAt: Date;
  preference: "AVAILABLE" | "PREFERRED" | "UNAVAILABLE";
}

export interface EngineLeave {
  employeeId: string;
  startAt: Date;
  endAt: Date;
}

export interface EnginePolicy {
  minRestHours: number;
  maxWeeklyHours: number;
  maxConsecutiveDays: number;
}

export interface EngineInput {
  weekStart: string; // YYYY-MM-DD
  shifts: EngineShift[];
  employees: EngineEmployee[];
  availabilities: EngineAvailability[];
  leaves: EngineLeave[];
  policy: EnginePolicy;
  /** Existing pinned assignments that must not be changed */
  existingAssignments?: Array<{
    shiftId: string;
    employeeId: string;
    positionId: string;
    isPinned: boolean;
  }>;
}

export interface ProposedAssignment {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  positionId: string;
  positionName: string;
  score: number;
  explanation: string;
  isPinned: boolean;
}

export interface UnfilledShiftSlot {
  shiftId: string;
  shiftName: string;
  workDate: string;
  positionId?: string;
  missingCount: number;
  reasons: string[];
}

export interface EmployeeHourSummary {
  employeeId: string;
  fullName: string;
  targetMinutes: number;
  assignedMinutes: number;
  shiftCount: number;
  estimatedWageVND: string;
}

export interface RecommendationResult {
  engineName: string;
  weekStart: string;
  totalSlots: number;
  filledSlots: number;
  proposedAssignments: ProposedAssignment[];
  unfilledShifts: UnfilledShiftSlot[];
  employeeSummaries: EmployeeHourSummary[];
  estimatedTotalLaborCostVND: string;
  executionTimeMs: number;
}

/**
 * Standard interface for pluggable scheduling engines
 * (e.g. Greedy v1 or Google OR-Tools CP-SAT v2).
 */
export interface SchedulingEngine {
  readonly name: string;
  solve(input: EngineInput): Promise<RecommendationResult>;
}
