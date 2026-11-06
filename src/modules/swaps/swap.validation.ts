import { z } from "zod";

export const createSwapRequestSchema = z.object({
  shiftId: z.string().uuid("Ca làm việc không hợp lệ"),
  targetEmployeeId: z.string().uuid("Nhân viên nhận ca không hợp lệ"),
  reason: z.string().trim().max(500, "Lý do tối đa 500 ký tự").optional().nullable(),
});

export const respondSwapSchema = z.object({
  accept: z.boolean(),
});

export const reviewSwapSchema = z.object({
  approved: z.boolean(),
  reviewNote: z.string().trim().max(500).optional().nullable(),
});

export type CreateSwapRequestInput = z.infer<typeof createSwapRequestSchema>;
export type RespondSwapInput = z.infer<typeof respondSwapSchema>;
export type ReviewSwapInput = z.infer<typeof reviewSwapSchema>;

