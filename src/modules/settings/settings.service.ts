import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { AppValidationError, assertPermission } from "@/lib/permissions";
import { recordAuditLog } from "@/modules/audit/audit.service";

export const systemSettingsBundleSchema = z.object({
  shopProfile: z.object({
    name: z.string().trim().min(2, "Tên quán tối thiểu 2 ký tự").max(120),
    address: z.string().trim().max(255),
    phone: z.string().trim().max(40),
    timezone: z.string().default("Asia/Ho_Chi_Minh"),
    currency: z.string().default("VND"),
  }),
  schedulingPolicy: z.object({
    minRestHours: z.coerce.number().min(0).max(24),
    maxWeeklyHours: z.coerce.number().min(8).max(84),
    maxConsecutiveDays: z.coerce.number().int().min(1).max(14),
    availabilityLeadDays: z.coerce.number().int().min(0).max(14),
  }),
  attendancePolicy: z.object({
    qrExpirySeconds: z.coerce.number().int().min(15).max(300),
    lateGraceMinutes: z.coerce.number().int().min(0).max(60),
    earlyClockInMinutes: z.coerce.number().int().min(0).max(120),
  }),
  payrollPolicy: z.object({
    overtimeMultiplier: z.coerce.number().min(1).max(4),
    overtimeWeeklyThresholdHours: z.coerce.number().min(20).max(84),
  }),
});

export type SystemSettingsBundle = z.infer<typeof systemSettingsBundleSchema>;

const DEFAULT_BUNDLE: SystemSettingsBundle = {
  shopProfile: {
    name: "D'lat Cafe",
    address: "12 Nguyễn Chí Thanh, Phường 1, Đà Lạt",
    phone: "0263 388 9999",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
  },
  schedulingPolicy: {
    minRestHours: 8,
    maxWeeklyHours: 48,
    maxConsecutiveDays: 6,
    availabilityLeadDays: 3,
  },
  attendancePolicy: {
    qrExpirySeconds: 45,
    lateGraceMinutes: 5,
    earlyClockInMinutes: 30,
  },
  payrollPolicy: {
    overtimeMultiplier: 1.5,
    overtimeWeeklyThresholdHours: 48,
  },
};

/**
 * Internal loader without RBAC — only for server-side business rules
 * (e.g. scheduling policy). Never return its output directly to EMPLOYEE clients.
 */
export async function loadSettingsBundle(): Promise<SystemSettingsBundle> {
  const rows = await prisma.systemSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const pick = <K extends keyof SystemSettingsBundle>(
    key: string,
    field: K,
  ): SystemSettingsBundle[K] =>
    ({
      ...DEFAULT_BUNDLE[field],
      ...((map.get(key) as Record<string, unknown> | undefined) ?? {}),
    }) as SystemSettingsBundle[K];

  return {
    shopProfile: pick("shop_profile", "shopProfile"),
    schedulingPolicy: pick("scheduling_policy", "schedulingPolicy"),
    attendancePolicy: pick("attendance_policy", "attendancePolicy"),
    payrollPolicy: pick("payroll_policy", "payrollPolicy"),
  };
}

export const settingsService = {
  async getSettings(actor: SessionUser): Promise<SystemSettingsBundle> {
    assertPermission(actor.role, "settings:read");
    return loadSettingsBundle();
  },

  async updateSettings(
    actor: SessionUser,
    rawInput: unknown,
  ): Promise<SystemSettingsBundle> {
    assertPermission(actor.role, "settings:write");

    const parsed = systemSettingsBundleSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Cấu hình hệ thống không hợp lệ",
      );
    }

    const data = parsed.data;

    await prisma.$transaction(async (tx) => {
      const entries: Array<[string, object]> = [
        ["shop_profile", data.shopProfile],
        ["scheduling_policy", data.schedulingPolicy],
        ["attendance_policy", data.attendancePolicy],
        ["payroll_policy", data.payrollPolicy],
      ];

      for (const [key, value] of entries) {
        await tx.systemSetting.upsert({
          where: { key },
          update: { value, updatedById: actor.userId },
          create: { key, value, updatedById: actor.userId },
        });
      }

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SYSTEM_SETTINGS_UPDATED",
          entityType: "SystemSetting",
          entityId: "bundle",
          newValues: data,
        },
        tx,
      );
    });

    return this.getSettings(actor);
  },
};

