import { z } from "zod";
import { notificationPreferencesSchema } from "@/modules/notifications/notification.validation";

function optionalNullableContactId(maxLen = 100) {
  return z
    .string()
    .trim()
    .max(maxLen, `Mã định danh tối đa ${maxLen} ký tự`)
    .optional()
    .nullable()
    .transform((v) => {
      if (v === undefined) {
        return undefined;
      }
      if (v === null || v === "") {
        return null;
      }
      return v;
    });
}

const skillInputSchema = z.object({
  positionId: z.string().uuid("Mã vị trí kỹ năng không hợp lệ"),
  proficiency: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]),
});

export const createEmployeeSchema = z
  .object({
    employeeCode: z
      .string()
      .trim()
      .min(2, "Mã nhân viên tối thiểu 2 ký tự")
      .max(32, "Mã nhân viên tối đa 32 ký tự")
      .regex(
        /^[A-Z0-9_-]+$/i,
        "Mã nhân viên chỉ gồm chữ không dấu, số, gạch ngang/dưới",
      )
      .transform((v) => v.toUpperCase()),
    fullName: z
      .string()
      .trim()
      .min(2, "Họ và tên tối thiểu 2 ký tự")
      .max(150, "Họ và tên tối đa 150 ký tự"),
    email: z
      .string()
      .trim()
      .email("Email không hợp lệ")
      .transform((v) => v.toLowerCase()),
    phone: z
      .string()
      .trim()
      .min(8, "Số điện thoại tối thiểu 8 ký tự")
      .max(30, "Số điện thoại tối đa 30 ký tự"),
    password: z
      .string()
      .min(6, "Mật khẩu ban đầu phải từ 6 ký tự trở lên")
      .max(100),
    role: z.enum(["OWNER", "MANAGER", "EMPLOYEE"]).default("EMPLOYEE"),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh phải theo dạng YYYY-MM-DD")
      .optional()
      .nullable(),
    hireDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày vào làm phải theo dạng YYYY-MM-DD"),
    primaryPositionId: z.string().uuid("Vui lòng chọn chức vụ chính"),
    skills: z.array(skillInputSchema).default([]),
    hourlyRate: z.coerce
      .number()
      .int("Mức lương VND phải là số nguyên")
      .min(1000, "Mức lương giờ tối thiểu 1.000 ₫")
      .max(5000000, "Mức lương giờ vượt giới hạn cho phép"),
    weeklyTargetHours: z.coerce
      .number()
      .min(0, "Giờ mục tiêu tuần không được âm")
      .max(84, "Giờ mục tiêu tuần tối đa 84 giờ")
      .default(24),
    maxWeeklyHours: z.coerce
      .number()
      .min(1, "Giờ tối đa tuần phải lớn hơn 0")
      .max(84, "Giờ tối đa tuần tối đa 84 giờ")
      .default(48),
    fixedRestDay: z
      .number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .nullable(),
    internalNotes: z.string().trim().max(1000).optional().nullable(),
    telegramChatId: optionalNullableContactId(100),
    zaloUserId: optionalNullableContactId(100),
    notificationPreferences: notificationPreferencesSchema.optional(),
  })
  .refine((data) => data.weeklyTargetHours <= data.maxWeeklyHours, {
    message: "Giờ mục tiêu mỗi tuần không được vượt quá giới hạn giờ tối đa tuần",
    path: ["weeklyTargetHours"],
  });

export const updateEmployeeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150).optional(),
    phone: z.string().trim().min(8).max(30).optional(),
    role: z.enum(["OWNER", "MANAGER", "EMPLOYEE"]).optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    primaryPositionId: z.string().uuid().optional(),
    skills: z.array(skillInputSchema).optional(),
    weeklyTargetHours: z.coerce.number().min(0).max(84).optional(),
    maxWeeklyHours: z.coerce.number().min(1).max(84).optional(),
    fixedRestDay: z.number().int().min(0).max(6).optional().nullable(),
    internalNotes: z.string().trim().max(1000).optional().nullable(),
    newPassword: z.string().min(6).max(100).optional(),
    telegramChatId: optionalNullableContactId(100),
    zaloUserId: optionalNullableContactId(100),
    notificationPreferences: z
      .object({
        telegram: z.boolean().optional(),
        zalo: z.boolean().optional(),
        email: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(
    (data) =>
      data.weeklyTargetHours === undefined ||
      data.maxWeeklyHours === undefined ||
      data.weeklyTargetHours <= data.maxWeeklyHours,
    {
      message: "Giờ mục tiêu mỗi tuần không được vượt quá giới hạn giờ tối đa tuần",
      path: ["weeklyTargetHours"],
    },
  );

export const addPayRateSchema = z.object({
  hourlyRate: z.coerce
    .number()
    .int("Đơn giá lương giờ VND phải là số nguyên")
    .min(1000, "Đơn giá lương giờ tối thiểu 1.000 ₫")
    .max(5000000, "Đơn giá lương giờ vượt giới hạn"),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày áp dụng phải theo định dạng YYYY-MM-DD"),
  note: z.string().trim().max(500).optional().nullable(),
});

export const setEmployeeStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
  reason: z
    .string()
    .trim()
    .min(2, "Vui lòng ghi rõ lý do thay đổi trạng thái nhân sự")
    .max(500),
});

export const updateSelfNotificationsSchema = z
  .object({
    telegramChatId: optionalNullableContactId(100),
    zaloUserId: optionalNullableContactId(100),
    notificationPreferences: z
      .object({
        telegram: z.boolean().optional(),
        zalo: z.boolean().optional(),
        email: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(
    (data) =>
      data.telegramChatId !== undefined ||
      data.zaloUserId !== undefined ||
      data.notificationPreferences !== undefined,
    { message: "Cần cung cấp ít nhất một thông tin thông báo để cập nhật" },
  );

export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;
export type AddPayRateInput = z.input<typeof addPayRateSchema>;
export type SetEmployeeStatusInput = z.input<typeof setEmployeeStatusSchema>;
export type UpdateSelfNotificationsInput = z.input<
  typeof updateSelfNotificationsSchema
>;

