import { logger as defaultLogger, redactString } from "@/lib/logger";
import {
  resolveLinkUrl,
  resolveNotificationEnv,
  type ChannelResult,
  type ChannelTransportDeps,
  type NotificationSeverity,
} from "./types";

export interface SendEmailInput {
  recipientUserId?: string;
  fullName?: string;
  to?: string | null;
  subject: string;
  title: string;
  message: string;
  linkUrl?: string | null;
  severity?: NotificationSeverity;
}

const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function escapeEmailHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatEmailBody(
  input: SendEmailInput,
  appUrl?: string,
): { text: string; html: string } {
  const greeting = input.fullName?.trim()
    ? `Xin chào ${input.fullName.trim()},`
    : "Xin chào,";
  const resolvedLink = resolveLinkUrl(input.linkUrl, appUrl);
  const textParts = [greeting, "", input.title, input.message];
  if (resolvedLink) {
    textParts.push("", `Xem chi tiết: ${resolvedLink}`);
  }
  textParts.push("", "— D'lat Cafe Workforce");
  const text = textParts.join("\n");

  const accentColor =
    input.severity === "urgent"
      ? "#dc2626"
      : input.severity === "warning"
        ? "#d97706"
        : "#059669";

  const linkHtml =
    resolvedLink && /^https?:\/\//i.test(resolvedLink)
      ? `<p style="margin:20px 0 0;"><a href="${escapeEmailHtml(resolvedLink)}" style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Xem chi tiết</a></p>`
      : resolvedLink
        ? `<p style="margin:16px 0 0;font-size:13px;color:#475569;">Đường dẫn: <code>${escapeEmailHtml(resolvedLink)}</code></p>`
        : "";

  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;color:#0f172a;">`,
    `<div style="border-left:4px solid ${accentColor};padding-left:12px;margin-bottom:16px;">`,
    `<p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;color:${accentColor};">D'lat Cafe Workforce</p>`,
    `<h2 style="margin:4px 0 0;font-size:18px;color:#0f172a;">${escapeEmailHtml(input.title)}</h2>`,
    `</div>`,
    `<p style="margin:0 0 12px;font-size:14px;color:#334155;">${escapeEmailHtml(greeting)}</p>`,
    `<p style="margin:0;font-size:14px;line-height:1.6;color:#1e293b;white-space:pre-line;">${escapeEmailHtml(input.message)}</p>`,
    linkHtml,
    `<hr style="margin:24px 0 12px;border:none;border-top:1px solid #e2e8f0;" />`,
    `<p style="margin:0;font-size:12px;color:#64748b;">Thông báo tự động từ hệ thống quản lý ca làm việc D'lat Cafe.</p>`,
    `</div>`,
  ].join("");

  return { text, html };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error("TIMEOUT");
          err.name = "AbortError";
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function sendEmailMessage(
  input: SendEmailInput,
  deps: ChannelTransportDeps = {},
): Promise<ChannelResult> {
  const startedAt = Date.now();
  const log = deps.logger ?? defaultLogger;
  const env = resolveNotificationEnv(deps.env, log);
  const fetchFn = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? env.defaultTimeoutMs;

  const to = input.to?.trim() ?? "";
  if (!to || !BASIC_EMAIL_REGEX.test(to)) {
    const durationMs = Date.now() - startedAt;
    log.info("notification.email.skipped", {
      reason: "MISSING_OR_INVALID_RECIPIENT_EMAIL",
      recipientUserId: input.recipientUserId,
    });
    return {
      channel: "email",
      recipientUserId: input.recipientUserId,
      provider: "email",
      status: "SKIPPED",
      reason: "MISSING_OR_INVALID_RECIPIENT_EMAIL",
      durationMs,
    };
  }

  const from = env.emailFrom || "D'lat Cafe Workforce <no-reply@dlatcafe.local>";
  const { text, html } = formatEmailBody(input, env.appUrl);

  // 1. Injected EmailTransport (unit/integration tests or custom SMTP wrapper)
  if (deps.emailTransport) {
    try {
      const info = await withTimeout(
        deps.emailTransport.sendMail({
          from,
          to,
          subject: input.subject,
          text,
          html,
        }),
        timeoutMs,
      );
      const durationMs = Date.now() - startedAt;
      log.info("notification.email.sent", {
        provider: "smtp",
        target: to,
        recipientUserId: input.recipientUserId,
        externalId: info.messageId,
        durationMs,
      });
      return {
        channel: "email",
        recipientUserId: input.recipientUserId,
        target: to,
        provider: "smtp",
        status: "SENT",
        externalId: info.messageId,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const isAbort =
        error instanceof Error &&
        (error.name === "AbortError" || /timeout/i.test(error.message));
      const reason = isAbort
        ? "TIMEOUT"
        : redactString(
            error instanceof Error ? error.message : "EMAIL_TRANSPORT_ERROR",
          );
      log.error("notification.email.failed", {
        provider: "smtp",
        target: to,
        recipientUserId: input.recipientUserId,
        reason,
        durationMs,
      });
      return {
        channel: "email",
        recipientUserId: input.recipientUserId,
        target: to,
        provider: "smtp",
        status: "FAILED",
        reason,
        durationMs,
      };
    }
  }

  // 2. Resend REST API
  const resendKey = env.resendApiKey?.trim();
  if (resendKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(env.resendApiUrl.trim(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: input.subject,
          text,
          html,
        }),
        signal: controller.signal,
      });

      const rawBody = await res.text().catch(() => "");
      let parsed: { id?: string; message?: string; name?: string } | null =
        null;
      if (rawBody) {
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          parsed = null;
        }
      }

      const durationMs = Date.now() - startedAt;
      if (!res.ok) {
        const reason = redactString(
          parsed?.message ?? parsed?.name ?? `HTTP_${res.status}`,
        );
        log.error("notification.email.failed", {
          provider: "resend",
          target: to,
          recipientUserId: input.recipientUserId,
          statusCode: res.status,
          reason,
        });
        return {
          channel: "email",
          recipientUserId: input.recipientUserId,
          target: to,
          provider: "resend",
          status: "FAILED",
          statusCode: res.status,
          reason,
          durationMs,
        };
      }

      log.info("notification.email.sent", {
        provider: "resend",
        target: to,
        recipientUserId: input.recipientUserId,
        externalId: parsed?.id,
        durationMs,
      });
      return {
        channel: "email",
        recipientUserId: input.recipientUserId,
        target: to,
        provider: "resend",
        status: "SENT",
        statusCode: res.status,
        externalId: parsed?.id,
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
            error instanceof Error ? error.message : "RESEND_NETWORK_ERROR",
          );
      log.error("notification.email.error", {
        provider: "resend",
        target: to,
        recipientUserId: input.recipientUserId,
        reason,
        durationMs,
      });
      return {
        channel: "email",
        recipientUserId: input.recipientUserId,
        target: to,
        provider: "resend",
        status: "FAILED",
        reason,
        durationMs,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // 3. Nodemailer SMTP transport
  const smtpHost = env.smtpHost?.trim();
  if (smtpHost) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure,
        auth: env.smtpUser
          ? { user: env.smtpUser, pass: env.smtpPass ?? "" }
          : undefined,
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs,
      });

      const info = await withTimeout(
        transporter.sendMail({
          from,
          to,
          subject: input.subject,
          text,
          html,
        }),
        timeoutMs,
      );

      const durationMs = Date.now() - startedAt;
      log.info("notification.email.sent", {
        provider: "smtp",
        target: to,
        recipientUserId: input.recipientUserId,
        externalId: info.messageId,
        durationMs,
      });
      return {
        channel: "email",
        recipientUserId: input.recipientUserId,
        target: to,
        provider: "smtp",
        status: "SENT",
        externalId: info.messageId,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const isAbort =
        error instanceof Error &&
        (error.name === "AbortError" || /timeout/i.test(error.message));
      const reason = isAbort
        ? "TIMEOUT"
        : redactString(
            error instanceof Error ? error.message : "SMTP_SEND_ERROR",
          );
      log.error("notification.email.failed", {
        provider: "smtp",
        target: to,
        recipientUserId: input.recipientUserId,
        reason,
        durationMs,
      });
      return {
        channel: "email",
        recipientUserId: input.recipientUserId,
        target: to,
        provider: "smtp",
        status: "FAILED",
        reason,
        durationMs,
      };
    }
  }

  // 4. Unconfigured safe fallback
  const durationMs = Date.now() - startedAt;
  log.info("notification.email.skipped", {
    reason: "EMAIL_NOT_CONFIGURED",
    recipientUserId: input.recipientUserId,
  });
  return {
    channel: "email",
    recipientUserId: input.recipientUserId,
    target: to,
    status: "SKIPPED",
    reason: "EMAIL_NOT_CONFIGURED",
    durationMs,
  };
}
