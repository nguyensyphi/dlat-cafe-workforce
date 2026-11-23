import crypto from "node:crypto";
import { logger as defaultLogger, redactString } from "@/lib/logger";
import {
  resolveLinkUrl,
  resolveNotificationEnv,
  type ChannelResult,
  type ChannelTransportDeps,
} from "./types";

export interface SendZaloInput {
  recipientUserId?: string;
  fullName?: string;
  phone?: string | null;
  zaloUserId?: string | null;
  eventType: string;
  title: string;
  message: string;
  linkUrl?: string | null;
  dedupeKey?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  templateData?: Record<string, string | number>;
}

export function normalizeVietnamPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) {
    return null;
  }
  const cleaned = raw.replace(/[\s.\-()+]/g, "");
  if (/^0\d{8,10}$/.test(cleaned)) {
    return `84${cleaned.slice(1)}`;
  }
  if (/^84\d{8,10}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

function maskPhone(phone: string): string {
  if (phone.length <= 5) {
    return "***";
  }
  return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}

export async function sendZaloMessage(
  input: SendZaloInput,
  deps: ChannelTransportDeps = {},
): Promise<ChannelResult> {
  const startedAt = Date.now();
  const log = deps.logger ?? defaultLogger;
  const env = resolveNotificationEnv(deps.env, log);
  const fetchFn = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? env.defaultTimeoutMs;

  const accessToken = env.zaloOaAccessToken?.trim();
  const templateId = env.zaloZnsTemplateId?.trim();
  const webhookUrl = env.zaloWebhookUrl?.trim();
  const zaloUserId = input.zaloUserId?.trim() || null;
  const normalizedPhone = normalizeVietnamPhone(input.phone);

  let endpoint: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;
  let provider: "zalo-oa" | "zalo-zns" | "zalo-webhook";
  let target: string | undefined;

  if (accessToken && zaloUserId) {
    provider = "zalo-oa";
    endpoint = env.zaloOaApiUrl.trim();
    headers = {
      "Content-Type": "application/json",
      access_token: accessToken,
    };
    const fullLink = resolveLinkUrl(input.linkUrl, env.appUrl);
    const text = fullLink
      ? `[${input.title}]\n${input.message}\n${fullLink}`
      : `[${input.title}]\n${input.message}`;
    body = {
      recipient: { user_id: zaloUserId },
      message: { text: text.slice(0, 2000) },
    };
    target = zaloUserId;
  } else if (accessToken && templateId && normalizedPhone) {
    provider = "zalo-zns";
    endpoint = env.zaloZnsApiUrl.trim();
    headers = {
      "Content-Type": "application/json",
      access_token: accessToken,
    };
    body = {
      phone: normalizedPhone,
      template_id: templateId,
      template_data: {
        customer_name: input.fullName?.trim() || "Nhân viên",
        title: input.title,
        message: input.message,
        ...(input.templateData ?? {}),
      },
      tracking_id: input.dedupeKey || crypto.randomUUID(),
    };
    target = maskPhone(normalizedPhone);
  } else if (webhookUrl) {
    provider = "zalo-webhook";
    endpoint = webhookUrl;
    headers = {
      "Content-Type": "application/json",
      ...(env.zaloWebhookSecret?.trim()
        ? { "x-webhook-secret": env.zaloWebhookSecret.trim() }
        : {}),
    };
    body = {
      event: input.eventType,
      recipient: {
        userId: input.recipientUserId ?? null,
        fullName: input.fullName ?? null,
        phone: normalizedPhone,
        zaloUserId,
      },
      title: input.title,
      message: input.message,
      linkUrl: resolveLinkUrl(input.linkUrl, env.appUrl),
      metadata: input.metadata ?? {},
      timestamp: new Date().toISOString(),
    };
    target = zaloUserId ?? (normalizedPhone ? maskPhone(normalizedPhone) : "webhook");
  } else if (!accessToken && !webhookUrl) {
    const durationMs = Date.now() - startedAt;
    log.info("notification.zalo.skipped", {
      reason: "ZALO_NOT_CONFIGURED",
      recipientUserId: input.recipientUserId,
    });
    return {
      channel: "zalo",
      recipientUserId: input.recipientUserId,
      status: "SKIPPED",
      reason: "ZALO_NOT_CONFIGURED",
      durationMs,
    };
  } else {
    const durationMs = Date.now() - startedAt;
    log.info("notification.zalo.skipped", {
      reason: "MISSING_ZALO_TARGET_OR_TEMPLATE",
      recipientUserId: input.recipientUserId,
    });
    return {
      channel: "zalo",
      recipientUserId: input.recipientUserId,
      status: "SKIPPED",
      reason: "MISSING_ZALO_TARGET_OR_TEMPLATE",
      durationMs,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawBody = await res.text().catch(() => "");
    let parsed: {
      error?: number;
      message?: string;
      data?: { message_id?: string; msg_id?: string };
      id?: string;
    } | null = null;
    if (rawBody) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = null;
      }
    }

    const durationMs = Date.now() - startedAt;
    const hasZaloApiError =
      typeof parsed?.error === "number" && parsed.error !== 0;

    if (!res.ok || hasZaloApiError) {
      const reason = redactString(
        hasZaloApiError
          ? `ZALO_ERROR_${parsed?.error}: ${parsed?.message ?? "Unknown"}`
          : parsed?.message ?? `HTTP_${res.status}`,
      );
      log.error("notification.zalo.failed", {
        provider,
        target,
        recipientUserId: input.recipientUserId,
        statusCode: res.status,
        reason,
      });
      return {
        channel: "zalo",
        recipientUserId: input.recipientUserId,
        target,
        provider,
        status: "FAILED",
        statusCode: res.status,
        reason,
        durationMs,
      };
    }

    const externalId =
      parsed?.data?.msg_id ?? parsed?.data?.message_id ?? parsed?.id;

    log.info("notification.zalo.sent", {
      provider,
      target,
      recipientUserId: input.recipientUserId,
      externalId,
      durationMs,
    });

    return {
      channel: "zalo",
      recipientUserId: input.recipientUserId,
      target,
      provider,
      status: "SENT",
      statusCode: res.status,
      externalId,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isAbort =
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message));
    const reason = isAbort
      ? "TIMEOUT"
      : redactString(
          error instanceof Error ? error.message : "ZALO_NETWORK_ERROR",
        );

    log.error("notification.zalo.error", {
      provider,
      target,
      recipientUserId: input.recipientUserId,
      reason,
      durationMs,
    });

    return {
      channel: "zalo",
      recipientUserId: input.recipientUserId,
      target,
      provider,
      status: "FAILED",
      reason,
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}
