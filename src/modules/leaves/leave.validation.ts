import { z } from "zod";

export const createLeaveRequestSchema = z
  .object({
    shiftId: z.string().uuid("Ca làm không hợp lệ").optional().nullable(),
    startAt: z.string().datetime({ message: "Thời gian bắt đầu không hợp lệ" }),
    endAt: z.string().datetime({ message: "Thời gian kết thúc không hợp lệ" }),
    reason: z
      .string()
      .trim()
      .min(5, "Lý do xin nghỉ tối thiểu 5 ký tự")
      .max(500, "Lý do tối đa 500 ký tự"),
  })
  .refine(
    (data) => new Date(data.endAt) > new Date(data.startAt),
    {
      message: "Thời gian kết thúc phải sau thời gian bắt đầu",
      path: ["endAt"],
    },
  );

export const reviewLeaveRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(500).optional().nullable(),
});

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type ReviewLeaveRequestInput = z.infer<typeof reviewLeaveRequestSchema>;

