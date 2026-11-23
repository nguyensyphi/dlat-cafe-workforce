import type { UserRole } from "@prisma/client";
import { getServerEnv } from "@/lib/env";
import { logger as defaultLogger } from "@/lib/logger";
import type { NotificationType } from "../notification.service";

export type NotificationChannel = "telegram" | "zalo" | "email";
export type ChannelDeliveryStatus = "SENT" | "SKIPPED" | "FAILED";
export type NotificationSeverity = "info" | "warning" | "urgent";

export interface UserChannelPreferences {
  telegram?: boolean;
  zalo?: boolean;
  email?: boolean;
}

export interface NotificationPolicyConfig {
  enableTelegram: boolean;
  enableZalo: boolean;
  enableEmail: boolean;
  managerTelegramChatIds: string[];
  groupTelegramChatId: string | null;
  shiftStartReminderMinutes: number;
  shiftEndReminderMinutes: number;
  cashDiscrepancyThresholdVnd: number;
}

export interface NotificationRecipient {
  userId?: string;
  fullName?: string;
  role?: UserRole;
  email?: string | null;
  phone?: string | null;
  telegramChatId?: string | null;
  zaloUserId?: string | null;
  preferences?: UserChannelPreferences | null;
}

export interface ExternalNotificationDispatchInput {
  eventType: NotificationType | string;
  title: string;
  message: string;
  linkUrl?: string | null;
  severity?: NotificationSeverity;
  dedupeKey?: string;
  recipients: NotificationRecipient[];
  metadata?: Record<string, string | number | boolean | null | undefined>;
  templateData?: Record<string, string | number>;
  /** When true, also sends 1 copy to policy.groupTelegramChatId / TELEGRAM_DEFAULT_CHAT_ID and managerTelegramChatIds */
  includeGroupTelegram?: boolean;
  /** When true, also sends 1 copy to managerTelegramChatIds */
  includeManagers?: boolean;
  /** Explicit manager Telegram chat IDs to include when includeManagers or includeGroupTelegram is set */
  managerTelegramChatIds?: string[];
  /** When true and a single recipient has no telegramChatId, allow fallback to TELEGRAM_DEFAULT_CHAT_ID */
  fallbackToDefaultTelegramChat?: boolean;
  /** Optional policy override (mainly for tests or pre-loaded policy) */
  policy?: Partial<NotificationPolicyConfig>;
  /** Optional policy override (mainly for tests or pre-loaded policy) */
  policyOverride?: Partial<NotificationPolicyConfig>;
}

export interface ChannelResult {
  channel: NotificationChannel;
  recipientUserId?: string;
  target?: string;
  provider?: string;
  status: ChannelDeliveryStatus;
  statusCode?: number;
  externalId?: string;
  reason?: string;
  durationMs: number;
}

export interface DispatchSummary {
  eventType: string;
  totalAttempted: number;
  sent: number;
  skipped: number;
  failed: number;
  results: ChannelResult[];
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface EmailSendPayload {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTransport {
  sendMail(payload: EmailSendPayload): Promise<{ messageId?: string }>;
}

export interface NotificationEnvConfig {
  appUrl?: string;
  telegramBotToken?: string;
  telegramApiBaseUrl: string;
  telegramDefaultChatId?: string;
  zaloOaAccessToken?: string;
  zaloOaApiUrl: string;
  zaloZnsApiUrl: string;
  zaloZnsTemplateId?: string;
  zaloWebhookUrl?: string;
  zaloWebhookSecret?: string;
  resendApiKey?: string;
  resendApiUrl: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  emailFrom: string;
  defaultTimeoutMs: number;
}

export interface NotificationLogger {
  info(event: string, meta?: Record<string, unknown>): void;
  warn(event: string, meta?: Record<string, unknown>): void;
  error(event: string, meta?: Record<string, unknown>): void;
}

export interface ChannelTransportDeps {
  fetchImpl?: FetchLike;
  emailTransport?: EmailTransport;
  timeoutMs?: number;
  loadPolicy?: () => Promise<NotificationPolicyConfig>;
  env?: Partial<NotificationEnvConfig>;
  logger?: NotificationLogger;
}

function trimRawEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function resolveNotificationEnv(
  override?: Partial<NotificationEnvConfig>,
  log: NotificationLogger = defaultLogger,
): NotificationEnvConfig {
  try {
    const serverEnv = getServerEnv();
    return {
      appUrl: serverEnv.NEXT_PUBLIC_APP_URL,
      telegramBotToken: serverEnv.TELEGRAM_BOT_TOKEN,
      telegramApiBaseUrl: serverEnv.TELEGRAM_API_BASE_URL,
      telegramDefaultChatId: serverEnv.TELEGRAM_DEFAULT_CHAT_ID,
      zaloOaAccessToken: serverEnv.ZALO_OA_ACCESS_TOKEN,
      zaloOaApiUrl: serverEnv.ZALO_OA_API_URL,
      zaloZnsApiUrl: serverEnv.ZALO_ZNS_API_URL,
      zaloZnsTemplateId: serverEnv.ZALO_ZNS_TEMPLATE_ID,
      zaloWebhookUrl: serverEnv.ZALO_WEBHOOK_URL,
      zaloWebhookSecret: serverEnv.ZALO_WEBHOOK_SECRET,
      resendApiKey: serverEnv.RESEND_API_KEY,
      resendApiUrl: serverEnv.RESEND_API_URL,
      smtpHost: serverEnv.SMTP_HOST,
      smtpPort: serverEnv.SMTP_PORT,
      smtpSecure: serverEnv.SMTP_SECURE,
      smtpUser: serverEnv.SMTP_USER,
      smtpPass: serverEnv.SMTP_PASS,
      emailFrom: serverEnv.EMAIL_FROM,
      defaultTimeoutMs: serverEnv.NOTIFICATION_TIMEOUT_MS,
      ...override,
    };
  } catch (error) {
    log.warn("notification.env.fallback", {
      reason:
        error instanceof Error ? error.message : "INVALID_SERVER_ENV_FALLBACK",
    });
    const rawPort = Number(process.env.SMTP_PORT);
    const smtpPort =
      Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535
        ? rawPort
        : 587;
    const rawTimeout = Number(process.env.NOTIFICATION_TIMEOUT_MS);
    const defaultTimeoutMs =
      Number.isInteger(rawTimeout) && rawTimeout >= 500 && rawTimeout <= 30000
        ? rawTimeout
        : 5000;
    const rawSecure = process.env.SMTP_SECURE?.trim().toLowerCase();
    const smtpSecure =
      rawSecure === "true" || rawSecure === "1" || rawSecure === "yes";

    return {
      appUrl: trimRawEnv(process.env.NEXT_PUBLIC_APP_URL),
      telegramBotToken: trimRawEnv(process.env.TELEGRAM_BOT_TOKEN),
      telegramApiBaseUrl:
        trimRawEnv(process.env.TELEGRAM_API_BASE_URL) ??
        "https://api.telegram.org",
      telegramDefaultChatId: trimRawEnv(process.env.TELEGRAM_DEFAULT_CHAT_ID),
      zaloOaAccessToken: trimRawEnv(process.env.ZALO_OA_ACCESS_TOKEN),
      zaloOaApiUrl:
        trimRawEnv(process.env.ZALO_OA_API_URL) ??
        "https://openapi.zalo.me/v3.0/oa/message/cs",
      zaloZnsApiUrl:
        trimRawEnv(process.env.ZALO_ZNS_API_URL) ??
        "https://business.openapi.zalo.me/message/template",
      zaloZnsTemplateId: trimRawEnv(process.env.ZALO_ZNS_TEMPLATE_ID),
      zaloWebhookUrl: trimRawEnv(process.env.ZALO_WEBHOOK_URL),
      zaloWebhookSecret: trimRawEnv(process.env.ZALO_WEBHOOK_SECRET),
      resendApiKey: trimRawEnv(process.env.RESEND_API_KEY),
      resendApiUrl:
        trimRawEnv(process.env.RESEND_API_URL) ??
        "https://api.resend.com/emails",
      smtpHost: trimRawEnv(process.env.SMTP_HOST),
      smtpPort,
      smtpSecure,
      smtpUser: trimRawEnv(process.env.SMTP_USER),
      smtpPass: trimRawEnv(process.env.SMTP_PASS),
      emailFrom:
        trimRawEnv(process.env.EMAIL_FROM) ??
        "D'lat Cafe Workforce <no-reply@dlatcafe.local>",
      defaultTimeoutMs,
      ...override,
    };
  }
}

export function resolveLinkUrl(
  linkUrl?: string | null,
  appUrl?: string,
): string | null {
  const trimmed = linkUrl?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const base = appUrl?.trim().replace(/\/+$/, "");
  if (!base) {
    return trimmed;
  }
  return `${base}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}
