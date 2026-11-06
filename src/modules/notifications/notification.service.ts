import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  | "PAYROLL_APPROVED";

export interface NotificationMessage {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl?: string | null;
}

/**
 * Persists in-app notifications inside the caller's transaction so a
 * notification exists if and only if the business change was committed.
 * Delivery channels (Web Push, email) will hook in here in a later milestone.
 */
export async function createNotifications(
  db: Db,
  messages: NotificationMessage[],
): Promise<number> {
  const unique = new Map<string, NotificationMessage>();
  for (const m of messages) {
    unique.set(`${m.userId}:${m.type}:${m.title}:${m.message}`, m);
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
    })),
  });
  return result.count;
}

