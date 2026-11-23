import { z } from "zod";

function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function optionalString() {
  return z.preprocess(emptyToUndefined, z.string().optional());
}

function optionalStringWithDefault(defaultValue: string) {
  return z.preprocess(emptyToUndefined, z.string().default(defaultValue));
}

function optionalBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    const normalized = emptyToUndefined(value);
    if (normalized === undefined) {
      return undefined;
    }
    if (typeof normalized === "boolean") {
      return normalized;
    }
    if (typeof normalized === "string") {
      const lower = normalized.toLowerCase();
      if (lower === "true" || lower === "1" || lower === "yes") {
        return true;
      }
      if (lower === "false" || lower === "0" || lower === "no") {
        return false;
      }
    }
    return normalized;
  }, z.boolean().default(defaultValue));
}

function optionalInt(
  defaultValue: number,
  options: { min?: number; max?: number } = {},
) {
  let schema = z.coerce.number().int();
  if (options.min !== undefined) {
    schema = schema.min(options.min);
  }
  if (options.max !== undefined) {
    schema = schema.max(options.max);
  }
  return z.preprocess(emptyToUndefined, schema.default(defaultValue));
}

export const serverEnvSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(["development", "test", "production"]).default("development"),
  ),
  NEXT_PUBLIC_APP_URL: optionalString(),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: optionalString(),
  TELEGRAM_API_BASE_URL: optionalStringWithDefault("https://api.telegram.org"),
  TELEGRAM_DEFAULT_CHAT_ID: optionalString(),

  // Zalo OA / ZNS / Webhook
  ZALO_OA_ACCESS_TOKEN: optionalString(),
  ZALO_OA_API_URL: optionalStringWithDefault(
    "https://openapi.zalo.me/v3.0/oa/message/cs",
  ),
  ZALO_ZNS_API_URL: optionalStringWithDefault(
    "https://business.openapi.zalo.me/message/template",
  ),
  ZALO_ZNS_TEMPLATE_ID: optionalString(),
  ZALO_WEBHOOK_URL: optionalString(),
  ZALO_WEBHOOK_SECRET: optionalString(),

  // Email (Resend / SMTP)
  RESEND_API_KEY: optionalString(),
  RESEND_API_URL: optionalStringWithDefault("https://api.resend.com/emails"),
  SMTP_HOST: optionalString(),
  SMTP_PORT: optionalInt(587, { min: 1, max: 65535 }),
  SMTP_SECURE: optionalBoolean(false),
  SMTP_USER: optionalString(),
  SMTP_PASS: optionalString(),
  EMAIL_FROM: optionalStringWithDefault(
    "D'lat Cafe Workforce <no-reply@dlatcafe.local>",
  ),

  // Cron & Alert Defaults
  CRON_SECRET: optionalString(),
  ENABLE_IN_PROCESS_CRON: optionalBoolean(false),
  NOTIFICATION_CASH_DISCREPANCY_THRESHOLD_VND: optionalInt(0, { min: 0 }),
  SHIFT_START_REMINDER_MINUTES: optionalInt(15, { min: 0, max: 180 }),
  SHIFT_END_REMINDER_MINUTES: optionalInt(15, { min: 0, max: 180 }),
  NOTIFICATION_TIMEOUT_MS: optionalInt(5000, { min: 500, max: 30000 }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  rawEnv: Record<string, string | undefined> = process.env,
): ServerEnv {
  return serverEnvSchema.parse(rawEnv);
}

/**
 * Lazy-evaluated server environment config so `next build` succeeds
 * when runtime notification secrets are unset, and tests can mutate
 * `process.env` dynamically without stale cached module state.
 */
export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
