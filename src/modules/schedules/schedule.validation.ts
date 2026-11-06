import { z } from "zod";
import { isValidTimeHm } from "@/lib/date";
import { isMondayDateString } from "@/lib/shift-time";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có định dạng YYYY-MM-DD");

export const weekStartSchema = dateString.refine(isMondayDateString, {
  message: "Tuần làm việc phải bắt đầu vào Thứ Hai",
});

const timeString = z
  .string()
  .refine(isValidTimeHm, { message: "Giờ phải đúng định dạng HH:mm" });

export const createScheduleSchema = z.object({
  weekStart: weekStartSchema,
  generateFromTemplates: z.boolean().default(true),
  name: z.string().trim().max(150).optional(),
});

export const scheduleStatusActionSchema = z.object({
  action: z.enum(["PUBLISH", "LOCK", "UNLOCK", "ARCHIVE"]),
});

const positionRequirementSchema = z.object({
  positionId: z.string().uuid("Vị trí không hợp lệ"),
  minCount: z.number().int().min(0).max(20),
  maxCount: z.number().int().min(1).max(50).nullable().optional(),
});

const shiftBaseSchema = z.object({
  workDate: dateString,
  templateId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2, "Tên ca tối thiểu 2 ký tự").max(100),
  startTime: timeString,
  endTime: timeString,
  breakMinutes: z.number().int().min(0).max(240).default(0),
  requiredStaff: z.number().int().min(1, "Cần tối thiểu 1 nhân sự").max(50),
  maxStaff: z.number().int().min(1).max(50).nullable().optional(),
  isPeak: z.boolean().default(false),
  notes: z.string().trim().max(500).nullable().optional(),
  positionRequirements: z.array(positionRequirementSchema).default([]),
});

export const createShiftSchema = shiftBaseSchema.refine(
  (v) => v.maxStaff === null || v.maxStaff === undefined || v.maxStaff >= v.requiredStaff,
  { message: "Số nhân sự tối đa phải lớn hơn hoặc bằng số yêu cầu", path: ["maxStaff"] },
);

export const updateShiftSchema = shiftBaseSchema
  .omit({ templateId: true })
  .partial();

export const assignEmployeeSchema = z.object({
  employeeId: z.string().uuid("Nhân viên không hợp lệ"),
  positionId: z.string().uuid("Vị trí không hợp lệ").optional(),
  allowWarnings: z.boolean().default(false),
});

export const moveAssignmentSchema = z.object({
  targetShiftId: z.string().uuid("Ca đích không hợp lệ"),
  allowWarnings: z.boolean().default(false),
});

export type CreateScheduleInput = z.input<typeof createScheduleSchema>;
export type CreateShiftInput = z.input<typeof createShiftSchema>;
export type UpdateShiftInput = z.input<typeof updateShiftSchema>;
export type AssignEmployeeInput = z.input<typeof assignEmployeeSchema>;
export type MoveAssignmentInput = z.input<typeof moveAssignmentSchema>;

