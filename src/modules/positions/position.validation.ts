import { z } from "zod";

export const createPositionSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Mã vị trí phải từ 2 ký tự trở lên")
    .max(50, "Mã vị trí tối đa 50 ký tự")
    .regex(
      /^[A-Z0-9_]+$/,
      "Mã vị trí chỉ dùng chữ in hoa không dấu, số và dấu gạch dưới (VD: PHA_CHE)",
    ),
  name: z
    .string()
    .trim()
    .min(2, "Tên vị trí phải từ 2 ký tự trở lên")
    .max(120, "Tên vị trí tối đa 120 ký tự"),
  description: z.string().trim().max(500).optional().nullable(),
  isPeakPriority: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const updatePositionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Tên vị trí phải từ 2 ký tự trở lên")
    .max(120)
    .optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isPeakPriority: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export type CreatePositionInput = z.input<typeof createPositionSchema>;
export type UpdatePositionInput = z.input<typeof updatePositionSchema>;

