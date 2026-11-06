import { z } from "zod";
import { calculateNetShiftMinutes, isValidTimeHm } from "@/lib/date";

const positionReqInputSchema = z
  .object({
    positionId: z.string().uuid("Mã vị trí không hợp lệ"),
    minCount: z.coerce.number().int().min(0).max(30),
    maxCount: z.coerce.number().int().min(1).max(30).optional().nullable(),
  })
  .refine(
    (d) => d.maxCount === undefined || d.maxCount === null || d.maxCount >= d.minCount,
    { message: "Số lượng tối đa của vị trí phải lớn hơn hoặc bằng tối thiểu" },
  );

export const createShiftTemplateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Mã ca tối thiểu 2 ký tự")
      .max(40, "Mã ca tối đa 40 ký tự")
      .regex(/^[A-Z0-9_]+$/i, "Mã ca chỉ gồm chữ không dấu, số và gạch dưới")
      .transform((v) => v.toUpperCase()),
    name: z
      .string()
      .trim()
      .min(2, "Tên ca tối thiểu 2 ký tự")
      .max(100, "Tên ca tối đa 100 ký tự"),
    startTime: z
      .string()
      .refine(isValidTimeHm, "Giờ bắt đầu phải theo định dạng HH:mm"),
    endTime: z
      .string()
      .refine(isValidTimeHm, "Giờ kết thúc phải theo định dạng HH:mm"),
    breakMinutes: z.coerce.number().int().min(0).max(240).default(0),
    minStaff: z.coerce.number().int().min(1, "Nhân sự tối thiểu >= 1").max(50),
    maxStaff: z.coerce.number().int().min(1, "Nhân sự tối đa >= 1").max(50),
    priority: z.coerce.number().int().min(1).max(10).default(1),
    isPeak: z.boolean().default(false),
    positionRequirements: z.array(positionReqInputSchema).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.minStaff > data.maxStaff) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Số nhân viên tối thiểu không được lớn hơn số tối đa",
        path: ["minStaff"],
      });
    }
    try {
      calculateNetShiftMinutes(data.startTime, data.endTime, data.breakMinutes);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          err instanceof Error ? err.message : "Thời lượng ca không hợp lệ",
        path: ["endTime"],
      });
    }
  });

export const updateShiftTemplateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  startTime: z.string().refine(isValidTimeHm, "Giờ bắt đầu HH:mm").optional(),
  endTime: z.string().refine(isValidTimeHm, "Giờ kết thúc HH:mm").optional(),
  breakMinutes: z.coerce.number().int().min(0).max(240).optional(),
  minStaff: z.coerce.number().int().min(1).max(50).optional(),
  maxStaff: z.coerce.number().int().min(1).max(50).optional(),
  priority: z.coerce.number().int().min(1).max(10).optional(),
  isPeak: z.boolean().optional(),
  isActive: z.boolean().optional(),
  positionRequirements: z.array(positionReqInputSchema).optional(),
});

export type CreateShiftTemplateInput = z.input<typeof createShiftTemplateSchema>;
export type UpdateShiftTemplateInput = z.input<typeof updateShiftTemplateSchema>;

