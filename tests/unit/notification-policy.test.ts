import { describe, expect, it } from "vitest";
import {
  updateEmployeeSchema,
  updateSelfNotificationsSchema,
} from "@/modules/employees/employee.validation";
import { normalizeNotificationPreferences } from "@/modules/notifications/notification.validation";
import {
  DEFAULT_NOTIFICATION_POLICY,
  parseNotificationPolicy,
  shouldNotifyCashDiscrepancy,
  systemSettingsBundleSchema,
} from "@/modules/settings/settings.service";

const LEGACY_4_KEY_BUNDLE = {
  shopProfile: {
    name: "D'lat Cafe",
    address: "12 Nguyễn Chí Thanh, Đà Lạt",
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

describe("Notification Policy & Contact Preferences Validation", () => {
  it("parseNotificationPolicy returns defaults for null/undefined/empty and merges partial objects", () => {
    expect(parseNotificationPolicy(null)).toEqual(DEFAULT_NOTIFICATION_POLICY);
    expect(parseNotificationPolicy(undefined)).toEqual(
      DEFAULT_NOTIFICATION_POLICY,
    );
    expect(parseNotificationPolicy({})).toEqual(DEFAULT_NOTIFICATION_POLICY);

    const merged = parseNotificationPolicy({
      enableZalo: false,
      groupTelegramChatId: "   ",
      managerTelegramChatIds: [" 111 ", "222"],
      cashDiscrepancyThresholdVnd: "25000",
    });

    expect(merged).toEqual({
      enableTelegram: true,
      enableZalo: false,
      enableEmail: true,
      managerTelegramChatIds: ["111", "222"],
      groupTelegramChatId: null,
      shiftStartReminderMinutes: 15,
      shiftEndReminderMinutes: 15,
      cashDiscrepancyThresholdVnd: 25000,
    });
  });

  it("systemSettingsBundleSchema stays backward-compatible with legacy 4-key payloads and validates bounds", () => {
    const legacyParsed = systemSettingsBundleSchema.parse(LEGACY_4_KEY_BUNDLE);
    expect(legacyParsed.notificationPolicy).toEqual(
      DEFAULT_NOTIFICATION_POLICY,
    );

    const coerced = systemSettingsBundleSchema.parse({
      ...LEGACY_4_KEY_BUNDLE,
      notificationPolicy: {
        enableTelegram: true,
        enableZalo: true,
        enableEmail: false,
        managerTelegramChatIds: ["999888"],
        groupTelegramChatId: "-10012345",
        shiftStartReminderMinutes: "20",
        shiftEndReminderMinutes: "10",
        cashDiscrepancyThresholdVnd: "50000",
      },
    });
    expect(coerced.notificationPolicy.shiftStartReminderMinutes).toBe(20);
    expect(coerced.notificationPolicy.cashDiscrepancyThresholdVnd).toBe(50000);

    const invalidNegative = systemSettingsBundleSchema.safeParse({
      ...LEGACY_4_KEY_BUNDLE,
      notificationPolicy: { shiftStartReminderMinutes: -5 },
    });
    expect(invalidNegative.success).toBe(false);

    const invalidTooLarge = systemSettingsBundleSchema.safeParse({
      ...LEGACY_4_KEY_BUNDLE,
      notificationPolicy: { shiftEndReminderMinutes: 181 },
    });
    expect(invalidTooLarge.success).toBe(false);

    const invalidThreshold = systemSettingsBundleSchema.safeParse({
      ...LEGACY_4_KEY_BUNDLE,
      notificationPolicy: { cashDiscrepancyThresholdVnd: -1000 },
    });
    expect(invalidThreshold.success).toBe(false);

    // Reject "", null, and booleans rather than coercing to 0
    for (const badVal of ["", "   ", null, false, true]) {
      const badStart = systemSettingsBundleSchema.safeParse({
        ...LEGACY_4_KEY_BUNDLE,
        notificationPolicy: { shiftStartReminderMinutes: badVal },
      });
      expect(badStart.success).toBe(false);

      const badEnd = systemSettingsBundleSchema.safeParse({
        ...LEGACY_4_KEY_BUNDLE,
        notificationPolicy: { shiftEndReminderMinutes: badVal },
      });
      expect(badEnd.success).toBe(false);

      const badCash = systemSettingsBundleSchema.safeParse({
        ...LEGACY_4_KEY_BUNDLE,
        notificationPolicy: { cashDiscrepancyThresholdVnd: badVal },
      });
      expect(badCash.success).toBe(false);
    }
  });

  it("shouldNotifyCashDiscrepancy evaluates absolute cash differences against threshold for both number and bigint", () => {
    expect(
      shouldNotifyCashDiscrepancy(0, { cashDiscrepancyThresholdVnd: 0 }),
    ).toBe(false);
    expect(
      shouldNotifyCashDiscrepancy(0n, { cashDiscrepancyThresholdVnd: 0 }),
    ).toBe(false);
    expect(
      shouldNotifyCashDiscrepancy(-1000, { cashDiscrepancyThresholdVnd: 0 }),
    ).toBe(true);
    expect(
      shouldNotifyCashDiscrepancy(-1000n, { cashDiscrepancyThresholdVnd: 0 }),
    ).toBe(true);
    expect(
      shouldNotifyCashDiscrepancy(-5000, {
        cashDiscrepancyThresholdVnd: 10000,
      }),
    ).toBe(false);
    expect(
      shouldNotifyCashDiscrepancy(-5000n, {
        cashDiscrepancyThresholdVnd: 10000,
      }),
    ).toBe(false);
    expect(
      shouldNotifyCashDiscrepancy(-10000, {
        cashDiscrepancyThresholdVnd: 10000,
      }),
    ).toBe(true);
    expect(
      shouldNotifyCashDiscrepancy(-10000n, {
        cashDiscrepancyThresholdVnd: 10000,
      }),
    ).toBe(true);
    expect(
      shouldNotifyCashDiscrepancy(15000, {
        cashDiscrepancyThresholdVnd: 10000,
      }),
    ).toBe(true);
    expect(
      shouldNotifyCashDiscrepancy(15000n, {
        cashDiscrepancyThresholdVnd: 10000,
      }),
    ).toBe(true);
  });

  it("normalizes notification preferences and validates self/admin update schemas", () => {
    expect(normalizeNotificationPreferences(null)).toEqual({
      telegram: true,
      zalo: true,
      email: true,
    });

    expect(
      normalizeNotificationPreferences({
        telegram: false,
        email: false,
      }),
    ).toEqual({
      telegram: false,
      zalo: true,
      email: false,
    });

    const selfParsed = updateSelfNotificationsSchema.parse({
      telegramChatId: "  ",
      zaloUserId: " 4123456 ",
      notificationPreferences: { email: false },
    });
    expect(selfParsed.telegramChatId).toBeNull();
    expect(selfParsed.zaloUserId).toBe("4123456");
    expect(selfParsed.notificationPreferences).toEqual({ email: false });

    const emptySelf = updateSelfNotificationsSchema.safeParse({});
    expect(emptySelf.success).toBe(false);

    const empParsed = updateEmployeeSchema.parse({
      fullName: "Nguyễn Văn A",
      telegramChatId: "123456",
      zaloUserId: "",
      notificationPreferences: { telegram: true, zalo: false, email: true },
    });
    expect(empParsed.telegramChatId).toBe("123456");
    expect(empParsed.zaloUserId).toBeNull();
    expect(empParsed.notificationPreferences).toEqual({
      telegram: true,
      zalo: false,
      email: true,
    });

    // Partial notificationPreferences on updateEmployeeSchema must NOT fill omitted keys with default(true)
    const partialEmp = updateEmployeeSchema.parse({
      notificationPreferences: { zalo: true },
    });
    expect(partialEmp.notificationPreferences).toEqual({ zalo: true });
    expect(partialEmp.notificationPreferences?.telegram).toBeUndefined();
    expect(partialEmp.notificationPreferences?.email).toBeUndefined();
  });
});
