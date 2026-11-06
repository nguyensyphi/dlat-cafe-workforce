import { z } from "zod";
import { isMondayDateString } from "@/lib/shift-time";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có định dạng YYYY-MM-DD");

export const availabilitySlotSchema = z.object({
  workDate: dateString,
  templateId: z.string().uuid("Ca mẫu không hợp lệ"),
  preference: z.enum(["AVAILABLE", "PREFERRED", "UNAVAILABLE"]),
  note: z.string().trim().max(255).optional().nullable(),
});

export const submitAvailabilitySchema = z.object({
  weekStart: dateString.refine(isMondayDateString, {
    message: "Tuần làm việc phải bắt đầu vào Thứ Hai",
  }),
  slots: z.array(availabilitySlotSchema),
});

export type SubmitAvailabilityInput = z.infer<typeof submitAvailabilitySchema>;

