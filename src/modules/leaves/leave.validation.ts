import { z } from "zod";

const isoDateTimeStringSchema = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .refine((val) => !Number.isNaN(Date.parse(val)), { message });

export const createLeaveRequestSchema = z
  .object({
    shiftId: z.string().uuid("Ca làm không hợp lệ").optional().nullable(),
    startAt: isoDateTimeStringSchema("Thời gian bắt đầu không hợp lệ"),
    endAt: isoDateTimeStringSchema("Thời gian kết thúc không hợp lệ"),
    isEmergency: z.boolean().optional().default(false),
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

export type CreateLeaveRequestInput = z.input<typeof createLeaveRequestSchema>;
export type ReviewLeaveRequestInput = z.input<typeof reviewLeaveRequestSchema>;

