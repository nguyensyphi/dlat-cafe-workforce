import { z } from "zod";

export const scanQrAttendanceSchema = z.object({
  token: z.string().min(10, "Mã QR không hợp lệ"),
  eventType: z.enum(["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"], {
    errorMap: () => ({ message: "Loại sự kiện chấm công không hợp lệ" }),
  }),
  note: z.string().max(255).optional().nullable(),
  idempotencyKey: z.string().max(128).optional().nullable(),
  deviceId: z.string().max(100).optional().nullable(),
});

export const manualAdjustAttendanceSchema = z.object({
  clockIn: z.string().datetime().optional().nullable(),
  clockOut: z.string().datetime().optional().nullable(),
  approvedMinutes: z.number().int().min(0, "Số phút duyệt không được âm"),
  paidMinutes: z.number().int().min(0, "Số phút tính lương không được âm"),
  status: z.enum(["APPROVED", "REJECTED", "PENDING"]),
  adjustmentReason: z
    .string()
    .trim()
    .min(5, "Vui lòng nhập lý do điều chỉnh tối thiểu 5 ký tự")
    .max(500, "Lý do điều chỉnh tối đa 500 ký tự"),
});

export type ScanQrAttendanceInput = z.infer<typeof scanQrAttendanceSchema>;
export type ManualAdjustAttendanceInput = z.infer<typeof manualAdjustAttendanceSchema>;

