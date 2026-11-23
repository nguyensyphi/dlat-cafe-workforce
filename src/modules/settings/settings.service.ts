import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { AppValidationError, assertPermission } from "@/lib/permissions";
import { recordAuditLog } from "@/modules/audit/audit.service";

export interface NotificationPolicy {
  enableTelegram: boolean;
  enableZalo: boolean;
  enableEmail: boolean;
  managerTelegramChatIds: string[];
  groupTelegramChatId: string | null;
  shiftStartReminderMinutes: number;
  shiftEndReminderMinutes: number;
  cashDiscrepancyThresholdVnd: number;
}

export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = {
  enableTelegram: true,
  enableZalo: true,
  enableEmail: true,
  managerTelegramChatIds: [],
  groupTelegramChatId: null,
  shiftStartReminderMinutes: 15,
  shiftEndReminderMinutes: 15,
  cashDiscrepancyThresholdVnd: 0,
};

function strictPolicyInt(options: {
  min: number;
  minMessage: string;
  max: number;
  maxMessage: string;
  defaultValue: number;
}) {
  return z.preprocess(
    (value) => {
      if (value === undefined) {
        return undefined;
      }
      if (
        value === null ||
        typeof value === "boolean" ||
        typeof value === "object"
      ) {
        return Number.NaN;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return Number.NaN;
        }
        return Number(trimmed);
      }
      return value;
    },
    z
      .number({ message: options.minMessage })
      .int(options.minMessage)
      .min(options.min, options.minMessage)
      .max(options.max, options.maxMessage)
      .default(options.defaultValue),
  );
}

export const notificationPolicySchema = z.object({
  enableTelegram: z.boolean().default(true),
  enableZalo: z.boolean().default(true),
  enableEmail: z.boolean().default(true),
  managerTelegramChatIds: z
    .array(z.string().trim().min(1).max(100))
    .max(20)
    .default([]),
  groupTelegramChatId: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value ?? null;
      }
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(100).nullable().default(null),
  ),
  shiftStartReminderMinutes: strictPolicyInt({
    min: 0,
    minMessage: "Số phút nhắc trước giờ vào ca không được âm",
    max: 180,
    maxMessage: "Số phút nhắc trước giờ vào ca tối đa 180 phút",
    defaultValue: 15,
  }),
  shiftEndReminderMinutes: strictPolicyInt({
    min: 0,
    minMessage: "Số phút nhắc trước giờ tan ca không được âm",
    max: 180,
    maxMessage: "Số phút nhắc trước giờ tan ca tối đa 180 phút",
    defaultValue: 15,
  }),
  cashDiscrepancyThresholdVnd: strictPolicyInt({
    min: 0,
    minMessage: "Ngưỡng chênh lệch tiền két không được âm",
    max: 100_000_000,
    maxMessage: "Ngưỡng chênh lệch tiền két vượt giới hạn",
    defaultValue: 0,
  }),
});

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
  notificationPolicy: notificationPolicySchema.default(
    DEFAULT_NOTIFICATION_POLICY,
  ),
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
  notificationPolicy: DEFAULT_NOTIFICATION_POLICY,
};

export function parseNotificationPolicy(raw: unknown): NotificationPolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_NOTIFICATION_POLICY };
  }
  const parsed = notificationPolicySchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return { ...DEFAULT_NOTIFICATION_POLICY };
}

export function shouldNotifyCashDiscrepancy(
  cashDifferenceVnd: number | bigint,
  policy: Pick<NotificationPolicy, "cashDiscrepancyThresholdVnd">,
): boolean {
  const rawThreshold = policy.cashDiscrepancyThresholdVnd;
  if (typeof cashDifferenceVnd === "bigint") {
    if (cashDifferenceVnd === 0n) return false;
    const absDiff =
      cashDifferenceVnd < 0n ? -cashDifferenceVnd : cashDifferenceVnd;
    const thresholdBig = BigInt(
      Math.max(0, Math.trunc(Number.isFinite(rawThreshold) ? rawThreshold : 0)),
    );
    return absDiff >= thresholdBig;
  }
  if (!Number.isFinite(cashDifferenceVnd) || cashDifferenceVnd === 0) {
    return false;
  }
  const threshold = Math.max(
    0,
    Number.isFinite(rawThreshold) ? rawThreshold : 0,
  );
  return Math.abs(cashDifferenceVnd) >= threshold;
}

/**
 * Internal loader without RBAC — only for server-side business rules
 * (e.g. scheduling policy, notification dispatch). Never return its output directly to EMPLOYEE clients.
 */
export async function loadSettingsBundle(): Promise<SystemSettingsBundle> {
  const rows = (await prisma.systemSetting?.findMany?.()) ?? [];
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
    notificationPolicy: parseNotificationPolicy(map.get("notification_policy")),
  };
}

export async function getNotificationPolicy(): Promise<NotificationPolicy> {
  const row = await prisma.systemSetting?.findUnique?.({
    where: { key: "notification_policy" },
  });
  return parseNotificationPolicy(row?.value);
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
    const hasExplicitNotificationPolicy =
      Boolean(rawInput) &&
      typeof rawInput === "object" &&
      !Array.isArray(rawInput) &&
      "notificationPolicy" in (rawInput as Record<string, unknown>) &&
      (rawInput as Record<string, unknown>).notificationPolicy !== undefined;

    const effectiveNotificationPolicy = hasExplicitNotificationPolicy
      ? data.notificationPolicy
      : await getNotificationPolicy();

    const effectiveBundle: SystemSettingsBundle = {
      ...data,
      notificationPolicy: effectiveNotificationPolicy,
    };

    await prisma.$transaction(async (tx) => {
      const entries: Array<[string, object]> = [
        ["shop_profile", effectiveBundle.shopProfile],
        ["scheduling_policy", effectiveBundle.schedulingPolicy],
        ["attendance_policy", effectiveBundle.attendancePolicy],
        ["payroll_policy", effectiveBundle.payrollPolicy],
        ["notification_policy", effectiveBundle.notificationPolicy],
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
          newValues: effectiveBundle,
        },
        tx,
      );
    });

    return this.getSettings(actor);
  },
};
