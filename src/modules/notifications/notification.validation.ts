import { z } from "zod";

export interface NotificationPreferences {
  telegram: boolean;
  zalo: boolean;
  email: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  telegram: true,
  zalo: true,
  email: true,
};

export const notificationPreferencesSchema = z.object({
  telegram: z.boolean().default(true),
  zalo: z.boolean().default(true),
  email: z.boolean().default(true),
});

export function normalizeNotificationPreferences(
  raw: unknown,
): NotificationPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  return {
    telegram: typeof obj.telegram === "boolean" ? obj.telegram : true,
    zalo: typeof obj.zalo === "boolean" ? obj.zalo : true,
    email: typeof obj.email === "boolean" ? obj.email : true,
  };
}
