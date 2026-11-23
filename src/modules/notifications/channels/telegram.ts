import { logger as defaultLogger, redactString } from "@/lib/logger";
import {
  resolveLinkUrl,
  resolveNotificationEnv,
  type ChannelResult,
  type ChannelTransportDeps,
  type NotificationSeverity,
} from "./types";

export interface SendTelegramInput {
  chatId?: string | null;
  recipientUserId?: string;
  title: string;
  message: string;
  linkUrl?: string | null;
  severity?: NotificationSeverity;
  parseMode?: "HTML" | "MarkdownV2";
  allowDefaultChatFallback?: boolean;
}

export function escapeTelegramHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(input: string): string {
  return escapeTelegramHtml(input).replace(/"/g, "&quot;");
}

function stripIncompleteHtmlEntity(escaped: string): string {
  return escaped.replace(/&[a-zA-Z0-9#]*$/, "");
}

export function formatTelegramMessage(
  input: SendTelegramInput,
  appUrl?: string,
): string {
  const prefix =
    input.severity === "urgent"
      ? "[KHẨN - D'lat Cafe]"
      : input.severity === "warning"
        ? "[CẢNH BÁO - D'lat Cafe]"
        : "[D'lat Cafe]";

  const rawTitle =
    input.title.length > 500
      ? `${input.title.slice(0, 497)}...`
      : input.title;
  const escapedTitle = stripIncompleteHtmlEntity(
    escapeTelegramHtml(`${prefix} ${rawTitle}`).slice(0, 800),
  );
  const header = `<b>${escapedTitle}</b>`;

  const fullLink = resolveLinkUrl(input.linkUrl, appUrl);
  const footer =
    fullLink && /^https?:\/\//i.test(fullLink)
      ? `\n\n<a href="${escapeHtmlAttribute(fullLink)}">Xem chi tiết</a>`
      : fullLink
        ? `\n\nĐường dẫn: ${escapeTelegramHtml(fullLink)}`
        : "";

  const body = escapeTelegramHtml(input.message);
  const combined = `${header}\n\n${body}${footer}`;
  if (combined.length <= 4000) {
    return combined;
  }

  // Reserve 2 chars for "\n\n" and 3 chars for "..."
  const maxBodyLen = Math.max(0, 4000 - header.length - footer.length - 5);
  const safeSlice = stripIncompleteHtmlEntity(body.slice(0, maxBodyLen));
  const truncatedBody = `${safeSlice}...`;
  const result = `${header}\n\n${truncatedBody}${footer}`;
  if (result.length <= 4000) {
    return result;
  }
  return stripIncompleteHtmlEntity(result.slice(0, 3997)) + "...";
}

export async function sendTelegramMessage(
  input: SendTelegramInput,
  deps: ChannelTransportDeps = {},
): Promise<ChannelResult> {
  const startedAt = Date.now();
  const log = deps.logger ?? defaultLogger;
  const env = resolveNotificationEnv(deps.env, log);
  const fetchFn = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? env.defaultTimeoutMs;

  const botToken = env.telegramBotToken?.trim();
  if (!botToken) {
    const durationMs = Date.now() - startedAt;
    log.warn("notification.telegram.skipped", {
      reason: "MISSING_TELEGRAM_BOT_TOKEN",
      recipientUserId: input.recipientUserId,
    });
    return {
      channel: "telegram",
      recipientUserId: input.recipientUserId,
      provider: "telegram-bot",
      status: "SKIPPED",
      reason: "MISSING_TELEGRAM_BOT_TOKEN",
      durationMs,
    };
  }

  const allowFallback = input.allowDefaultChatFallback !== false;
  const resolvedChatId =
    input.chatId?.trim() ||
    (allowFallback ? env.telegramDefaultChatId?.trim() : undefined);

  if (!resolvedChatId) {
    const durationMs = Date.now() - startedAt;
    log.info("notification.telegram.skipped", {
      reason: "MISSING_CHAT_ID",
      recipientUserId: input.recipientUserId,
    });
    return {
      channel: "telegram",
      recipientUserId: input.recipientUserId,
      provider: "telegram-bot",
      status: "SKIPPED",
      reason: "MISSING_CHAT_ID",
      durationMs,
    };
  }

  const parseMode = input.parseMode ?? "HTML";
  const text =
    parseMode === "HTML"
      ? formatTelegramMessage(input, env.appUrl)
      : `${input.title}\n\n${input.message}`.slice(0, 4000);

  const endpoint = `${env.telegramApiBaseUrl.replace(/\/+$/, "")}/bot${botToken}/sendMessage`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: resolvedChatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    const rawBody = await res.text().catch(() => "");
    let parsed: {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    } | null = null;
    if (rawBody) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = null;
      }
    }

    const durationMs = Date.now() - startedAt;
    if (!res.ok || parsed?.ok === false) {
      const reason = redactString(
        parsed?.description ?? `HTTP_${res.status}`,
      );
      log.error("notification.telegram.failed", {
        target: resolvedChatId,
        recipientUserId: input.recipientUserId,
        statusCode: res.status,
        reason,
      });
      return {
        channel: "telegram",
        recipientUserId: input.recipientUserId,
        target: resolvedChatId,
        provider: "telegram-bot",
        status: "FAILED",
        statusCode: res.status,
        reason,
        durationMs,
      };
    }

    const externalId =
      parsed?.result?.message_id !== undefined
        ? String(parsed.result.message_id)
        : undefined;

    log.info("notification.telegram.sent", {
      target: resolvedChatId,
      recipientUserId: input.recipientUserId,
      externalId,
      durationMs,
    });

    return {
      channel: "telegram",
      recipientUserId: input.recipientUserId,
      target: resolvedChatId,
      provider: "telegram-bot",
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
          error instanceof Error ? error.message : "TELEGRAM_NETWORK_ERROR",
        );

    log.error("notification.telegram.error", {
      target: resolvedChatId,
      recipientUserId: input.recipientUserId,
      reason,
      durationMs,
    });

    return {
      channel: "telegram",
      recipientUserId: input.recipientUserId,
      target: resolvedChatId,
      provider: "telegram-bot",
      status: "FAILED",
      reason,
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}
