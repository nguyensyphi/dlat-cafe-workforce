import { getServerEnv } from "@/lib/env";
import { logger as defaultLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_NOTIFICATION_POLICY,
  parseNotificationPolicy,
} from "@/modules/settings/settings.service";
import { sendEmailMessage } from "./channels/email";
import { sendTelegramMessage } from "./channels/telegram";
import {
  resolveNotificationEnv,
  type ChannelResult,
  type ChannelTransportDeps,
  type DispatchSummary,
  type ExternalNotificationDispatchInput,
  type NotificationPolicyConfig,
} from "./channels/types";
import { sendZaloMessage } from "./channels/zalo";

async function loadNotificationPolicySafe(): Promise<NotificationPolicyConfig> {
  let envFallback: NotificationPolicyConfig = {
    ...DEFAULT_NOTIFICATION_POLICY,
  };
  try {
    const serverEnv = getServerEnv();
    envFallback = {
      ...DEFAULT_NOTIFICATION_POLICY,
      shiftStartReminderMinutes: serverEnv.SHIFT_START_REMINDER_MINUTES,
      shiftEndReminderMinutes: serverEnv.SHIFT_END_REMINDER_MINUTES,
      cashDiscrepancyThresholdVnd:
        serverEnv.NOTIFICATION_CASH_DISCREPANCY_THRESHOLD_VND,
    };
  } catch {
    envFallback = { ...DEFAULT_NOTIFICATION_POLICY };
  }

  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: "notification_policy" },
    });
    if (!row) {
      return envFallback;
    }
    return parseNotificationPolicy(row.value);
  } catch {
    return envFallback;
  }
}

function makeSkipped(
  channel: ChannelResult["channel"],
  reason: string,
  recipientUserId?: string,
): ChannelResult {
  return {
    channel,
    recipientUserId,
    status: "SKIPPED",
    reason,
    durationMs: 0,
  };
}

/**
 * Post-commit external multi-channel dispatcher (Telegram, Zalo, Email).
 * Runs all eligible sends concurrently via `Promise.allSettled`, enforces
 * timeouts per channel, honors global policy + user channel preferences,
 * and NEVER throws into business callers.
 */
export async function dispatchExternalNotifications(
  input: ExternalNotificationDispatchInput,
  deps: ChannelTransportDeps = {},
): Promise<DispatchSummary> {
  const log = deps.logger ?? defaultLogger;
  const env = resolveNotificationEnv(deps.env, log);

  let loadedPolicy: NotificationPolicyConfig;
  try {
    loadedPolicy = await (deps.loadPolicy ?? loadNotificationPolicySafe)();
  } catch {
    loadedPolicy = { ...DEFAULT_NOTIFICATION_POLICY };
  }

  const policy: NotificationPolicyConfig = {
    ...DEFAULT_NOTIFICATION_POLICY,
    ...loadedPolicy,
    ...(input.policy ?? {}),
    ...(input.policyOverride ?? {}),
  };

  const tasks: Array<Promise<ChannelResult>> = [];
  const dispatchedTelegramChats = new Set<string>();

  for (const recipient of input.recipients) {
    const prefs = recipient.preferences ?? {};

    // 1. Telegram
    if (!policy.enableTelegram) {
      tasks.push(
        Promise.resolve(
          makeSkipped("telegram", "POLICY_DISABLED", recipient.userId),
        ),
      );
    } else if (prefs.telegram === false) {
      tasks.push(
        Promise.resolve(
          makeSkipped("telegram", "USER_OPTED_OUT", recipient.userId),
        ),
      );
    } else {
      const personalChatId = recipient.telegramChatId?.trim();
      if (personalChatId) {
        if (!dispatchedTelegramChats.has(personalChatId)) {
          dispatchedTelegramChats.add(personalChatId);
          tasks.push(
            sendTelegramMessage(
              {
                chatId: personalChatId,
                recipientUserId: recipient.userId,
                title: input.title,
                message: input.message,
                linkUrl: input.linkUrl,
                severity: input.severity,
                allowDefaultChatFallback: false,
              },
              deps,
            ),
          );
        }
      } else if (
        input.fallbackToDefaultTelegramChat &&
        input.recipients.length === 1 &&
        env.telegramDefaultChatId?.trim()
      ) {
        const fallbackChatId = env.telegramDefaultChatId.trim();
        if (!dispatchedTelegramChats.has(fallbackChatId)) {
          dispatchedTelegramChats.add(fallbackChatId);
          tasks.push(
            sendTelegramMessage(
              {
                chatId: fallbackChatId,
                recipientUserId: recipient.userId,
                title: input.title,
                message: input.message,
                linkUrl: input.linkUrl,
                severity: input.severity,
                allowDefaultChatFallback: false,
              },
              deps,
            ),
          );
        }
      } else {
        tasks.push(
          Promise.resolve(
            makeSkipped("telegram", "MISSING_CHAT_ID", recipient.userId),
          ),
        );
      }
    }

    // 2. Zalo
    if (!policy.enableZalo) {
      tasks.push(
        Promise.resolve(makeSkipped("zalo", "POLICY_DISABLED", recipient.userId)),
      );
    } else if (prefs.zalo === false) {
      tasks.push(
        Promise.resolve(makeSkipped("zalo", "USER_OPTED_OUT", recipient.userId)),
      );
    } else {
      tasks.push(
        sendZaloMessage(
          {
            recipientUserId: recipient.userId,
            fullName: recipient.fullName,
            phone: recipient.phone,
            zaloUserId: recipient.zaloUserId,
            eventType: String(input.eventType),
            title: input.title,
            message: input.message,
            linkUrl: input.linkUrl,
            dedupeKey: input.dedupeKey,
            metadata: input.metadata,
            templateData: input.templateData,
          },
          deps,
        ),
      );
    }

    // 3. Email
    if (!policy.enableEmail) {
      tasks.push(
        Promise.resolve(
          makeSkipped("email", "POLICY_DISABLED", recipient.userId),
        ),
      );
    } else if (prefs.email === false) {
      tasks.push(
        Promise.resolve(
          makeSkipped("email", "USER_OPTED_OUT", recipient.userId),
        ),
      );
    } else {
      tasks.push(
        sendEmailMessage(
          {
            recipientUserId: recipient.userId,
            fullName: recipient.fullName,
            to: recipient.email,
            subject: `[D'lat Cafe] ${input.title}`,
            title: input.title,
            message: input.message,
            linkUrl: input.linkUrl,
            severity: input.severity,
          },
          deps,
        ),
      );
    }
  }

  // Group / Manager Ops Telegram Routing (deduplicated)
  if ((input.includeGroupTelegram || input.includeManagers) && policy.enableTelegram) {
    const managerChatIds =
      input.managerTelegramChatIds ?? policy.managerTelegramChatIds;
    const opsChatIds = [
      ...(input.includeGroupTelegram && policy.groupTelegramChatId
        ? [policy.groupTelegramChatId]
        : []),
      ...managerChatIds,
      ...(input.includeGroupTelegram && env.telegramDefaultChatId
        ? [env.telegramDefaultChatId]
        : []),
    ]
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    for (const chatId of opsChatIds) {
      if (dispatchedTelegramChats.has(chatId)) {
        continue;
      }
      dispatchedTelegramChats.add(chatId);
      tasks.push(
        sendTelegramMessage(
          {
            chatId,
            title: input.title,
            message: input.message,
            linkUrl: input.linkUrl,
            severity: input.severity,
            allowDefaultChatFallback: false,
          },
          deps,
        ),
      );
    }
  }

  const settled = await Promise.allSettled(tasks);
  const results: ChannelResult[] = settled.map((entry) => {
    if (entry.status === "fulfilled") {
      return entry.value;
    }
    return {
      channel: "telegram",
      status: "FAILED",
      reason:
        entry.reason instanceof Error
          ? entry.reason.message
          : "UNEXPECTED_ERROR",
      durationMs: 0,
    };
  });

  const sent = results.filter((r) => r.status === "SENT").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  const summary: DispatchSummary = {
    eventType: String(input.eventType),
    totalAttempted: results.length,
    sent,
    skipped,
    failed,
    results,
  };

  if (failed > 0) {
    log.warn("notification.dispatch.completed_with_failures", {
      eventType: summary.eventType,
      totalAttempted: summary.totalAttempted,
      sent,
      skipped,
      failed,
    });
  } else {
    log.info("notification.dispatch.completed", {
      eventType: summary.eventType,
      totalAttempted: summary.totalAttempted,
      sent,
      skipped,
      failed,
    });
  }

  return summary;
}
