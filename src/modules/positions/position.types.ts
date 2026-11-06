export interface PositionDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isPeakPriority: boolean;
  sortOrder: number;
  isActive: boolean;
  employeeCount: number;
  skilledCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListPositionsFilter {
  includeInactive?: boolean;
}

