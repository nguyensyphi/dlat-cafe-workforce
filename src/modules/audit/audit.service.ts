import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface RecordAuditInput {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Prisma.InputJsonValue | null;
  newValues?: Prisma.InputJsonValue | null;
  reason?: string | null;
  ipAddress?: string | null;
}

export async function recordAuditLog(
  input: RecordAuditInput,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.oldValues !== undefined && input.oldValues !== null
        ? { oldValues: input.oldValues }
        : {}),
      ...(input.newValues !== undefined && input.newValues !== null
        ? { newValues: input.newValues }
        : {}),
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

export interface AuditLogDto {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
  reason: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export async function listAuditLogs(filters: {
  action?: string;
  entityType?: string;
  userId?: string;
  limit?: number;
} = {}): Promise<AuditLogDto[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 100,
    include: {
      user: {
        select: {
          email: true,
          employee: { select: { fullName: true } },
        },
      },
    },
  });

  return logs.map((l) => ({
    id: l.id,
    userId: l.userId,
    userName: l.user?.employee?.fullName ?? l.user?.email ?? "Hệ thống",
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    oldValues: l.oldValues,
    newValues: l.newValues,
    reason: l.reason,
    ipAddress: l.ipAddress,
    createdAt: l.createdAt.toISOString(),
  }));
}

