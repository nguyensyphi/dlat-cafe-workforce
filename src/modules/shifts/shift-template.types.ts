export interface ShiftPositionReqDto {
  positionId: string;
  positionCode: string;
  positionName: string;
  minCount: number;
  maxCount: number | null;
}

export interface ShiftTemplateDto {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  netDurationMinutes: number;
  minStaff: number;
  maxStaff: number;
  priority: number;
  isPeak: boolean;
  isActive: boolean;
  positionRequirements: ShiftPositionReqDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ListShiftTemplatesFilter {
  includeInactive?: boolean;
}

