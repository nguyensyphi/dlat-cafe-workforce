import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadSettingsBundle } from "@/modules/settings/settings.service";
import type {
  ChannelTransportDeps,
  DispatchSummary,
  NotificationRecipient,
  NotificationSeverity,
} from "./channels/types";
import { dispatchExternalNotifications } from "./dispatcher";
import { normalizeNotificationPreferences } from "./notification.validation";

type Db = Prisma.TransactionClient | typeof prisma;

export type NotificationType =
  | "SCHEDULE_PUBLISHED"
  | "SCHEDULE_UPDATED"
  | "LEAVE_SUBMITTED"
  | "LEAVE_REVIEWED"
  | "SWAP_REQUESTED"
  | "SWAP_ACCEPTED"
  | "SWAP_REVIEWED"
  | "SHIFT_REMINDER"
  | "ATTENDANCE_ANOMALY"
  | "HANDOVER_DISCREPANCY"
  | "SYSTEM_ALERT"
  | "PAYROLL_APPROVED";

export interface NotificationMessage {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl?: string | null;
  dedupeKey?: string | null;
}

export interface NotificationDedupeReport {
  count: number;
  insertedDedupeKeys: string[];
}

/**
 * Persists in-app notifications inside the caller's transaction so a
 * notification exists if and only if the business change was committed.
 * External multi-channel delivery runs post-commit via `dispatchExternalNotifications`.
 */
export async function createNotifications(
  db: Db,
  messages: NotificationMessage[],
): Promise<number> {
  const unique = new Map<string, NotificationMessage>();
  for (const m of messages) {
    const key = m.dedupeKey
      ? `dedupe:${m.dedupeKey}`
      : `${m.userId}:${m.type}:${m.title}:${m.message}`;
    unique.set(key, m);
  }
  if (unique.size === 0) {
    return 0;
  }
  const result = await db.notification.createMany({
    data: [...unique.values()].map((m) => ({
      userId: m.userId,
      type: m.type,
      title: m.title,
      message: m.message,
      linkUrl: m.linkUrl ?? null,
      ...(m.dedupeKey !== undefined ? { dedupeKey: m.dedupeKey } : {}),
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Idempotent helper for scheduled reminders: reports which non-null `dedupeKey`
 * entries were genuinely new so post-commit external channels only fire once.
 */
export async function createNotificationsWithDedupeReport(
  db: Db,
  messages: NotificationMessage[],
): Promise<NotificationDedupeReport> {
  if (messages.length === 0) {
    return { count: 0, insertedDedupeKeys: [] };
  }

  const candidateKeys = Array.from(
    new Set(
      messages
        .map((m) => m.dedupeKey)
        .filter((k): k is string => typeof k === "string" && k.length > 0),
    ),
  );

  let existingKeys = new Set<string>();
  if (candidateKeys.length > 0) {
    const existing = await db.notification.findMany({
      where: { dedupeKey: { in: candidateKeys } },
      select: { dedupeKey: true },
    });
    existingKeys = new Set(
      existing
        .map((row) => row.dedupeKey)
        .filter((k): k is string => typeof k === "string" && k.length > 0),
    );
  }

  const filtered = messages.filter(
    (m) => !m.dedupeKey || !existingKeys.has(m.dedupeKey),
  );
  if (filtered.length === 0) {
    return { count: 0, insertedDedupeKeys: [] };
  }

  const uniqueFiltered = new Map<string, NotificationMessage>();
  for (const m of filtered) {
    const key = m.dedupeKey
      ? `dedupe:${m.dedupeKey}`
      : `${m.userId}:${m.type}:${m.title}:${m.message}`;
    uniqueFiltered.set(key, m);
  }
  const uniqueItems = [...uniqueFiltered.values()];
  if (uniqueItems.length === 0) {
    return { count: 0, insertedDedupeKeys: [] };
  }

  if (uniqueItems.length === 1 || candidateKeys.length === 0) {
    const count = await createNotifications(db, uniqueItems);
    if (count === 0) {
      return { count: 0, insertedDedupeKeys: [] };
    }
    const insertedDedupeKeys = Array.from(
      new Set(
        uniqueItems
          .map((m) => m.dedupeKey)
          .filter((k): k is string => typeof k === "string" && k.length > 0),
      ),
    );
    return { count, insertedDedupeKeys };
  }

  let totalInserted = 0;
  const insertedDedupeKeys: string[] = [];
  for (const item of uniqueItems) {
    const c = await createNotifications(db, [item]);
    if (c > 0) {
      totalInserted += c;
      if (typeof item.dedupeKey === "string" && item.dedupeKey.length > 0) {
        insertedDedupeKeys.push(item.dedupeKey);
      }
    }
  }

  return { count: totalInserted, insertedDedupeKeys };
}

export interface DispatchNotificationsToUsersPayload {
  eventType: NotificationType | string;
  title: string;
  message: string;
  linkUrl?: string | null;
  severity?: NotificationSeverity;
  dedupeKey?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  includeManagers?: boolean;
  includeGroupTelegram?: boolean;
}

/**
 * Post-commit helper that loads active User contact records + system notification policy
 * and dispatches external multi-channel notifications safely without ever throwing.
 */
export async function dispatchNotificationsToUsers(
  userIds: string[],
  payload: DispatchNotificationsToUsersPayload,
  deps: ChannelTransportDeps = {},
): Promise<DispatchSummary | null> {
  try {
    const uniqueUserIds = Array.from(
      new Set(userIds.filter((id) => typeof id === "string" && id.length > 0)),
    );
    if (
      uniqueUserIds.length === 0 &&
      !payload.includeGroupTelegram &&
      !payload.includeManagers
    ) {
      return null;
    }

    const bundle = await loadSettingsBundle();
    const users =
      uniqueUserIds.length > 0
        ? await prisma.user.findMany({
            where: {
              id: { in: uniqueUserIds },
              isActive: true,
            },
            select: {
              id: true,
              role: true,
              email: true,
              telegramChatId: true,
              zaloUserId: true,
              notificationPreferences: true,
              employee: {
                select: {
                  fullName: true,
                  phone: true,
                  status: true,
                  deletedAt: true,
                },
              },
            },
          })
        : [];

    const recipients: NotificationRecipient[] = users
      .filter(
        (u) =>
          !u.employee ||
          (u.employee.status === "ACTIVE" && u.employee.deletedAt === null),
      )
      .map((u) => ({
        userId: u.id,
        fullName: u.employee?.fullName ?? u.email,
        role: u.role,
        email: u.email,
        phone: u.employee?.phone ?? null,
        telegramChatId: u.telegramChatId,
        zaloUserId: u.zaloUserId,
        preferences: normalizeNotificationPreferences(u.notificationPreferences),
      }));

    return await dispatchExternalNotifications(
      {
        eventType: payload.eventType,
        title: payload.title,
        message: payload.message,
        linkUrl: payload.linkUrl,
        severity: payload.severity,
        dedupeKey: payload.dedupeKey,
        metadata: payload.metadata,
        recipients,
        includeGroupTelegram: payload.includeGroupTelegram,
        includeManagers: payload.includeManagers,
        managerTelegramChatIds: payload.includeManagers
          ? bundle.notificationPolicy.managerTelegramChatIds
          : [],
        policy: bundle.notificationPolicy,
      },
      deps,
    );
  } catch {
    return null;
  }
}
