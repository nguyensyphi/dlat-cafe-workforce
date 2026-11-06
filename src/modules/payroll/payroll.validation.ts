import { z } from "zod";

export const createPayrollPeriodSchema = z
  .object({
    name: z.string().trim().min(3, "Tên kỳ lương tối thiểu 3 ký tự").max(150),
    periodStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày bắt đầu phải theo định dạng YYYY-MM-DD"),
    periodEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày kết thúc phải theo định dạng YYYY-MM-DD"),
    cutoffDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày chốt công phải theo định dạng YYYY-MM-DD")
      .optional()
      .nullable(),
    paymentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày chi trả phải theo định dạng YYYY-MM-DD")
      .optional()
      .nullable(),
    overtimeMultiplier: z.number().min(1.0).max(3.0).default(1.5),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine(
    (data) => new Date(data.periodEnd) >= new Date(data.periodStart),
    {
      message: "Ngày kết thúc kỳ lương phải sau hoặc cùng ngày với ngày bắt đầu",
      path: ["periodEnd"],
    },
  );

export const updatePayrollItemSchema = z.object({
  allowances: z.number().int().min(0, "Phụ cấp không được âm").default(0),
  bonuses: z.number().int().min(0, "Thưởng không được âm").default(0),
  deductions: z.number().int().min(0, "Khấu trừ không được âm").default(0),
  adjustments: z.number().int().default(0),
  adjustmentReason: z
    .string()
    .trim()
    .min(5, "Vui lòng nhập lý do điều chỉnh tối thiểu 5 ký tự")
    .max(500),
});

export const transitionPayrollStatusSchema = z.object({
  targetStatus: z.enum([
    "DRAFT",
    "CALCULATED",
    "REVIEWED",
    "APPROVED",
    "PAID",
    "LOCKED",
  ]),
  notes: z.string().max(500).optional().nullable(),
});

export type CreatePayrollPeriodInput = z.infer<typeof createPayrollPeriodSchema>;
export type UpdatePayrollItemInput = z.infer<typeof updatePayrollItemSchema>;
export type TransitionPayrollStatusInput = z.infer<
  typeof transitionPayrollStatusSchema
>;

