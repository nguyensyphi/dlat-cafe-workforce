import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatIsoDateOnly } from "@/lib/date";
import { normalizeNotificationPreferences } from "@/modules/notifications/notification.validation";
import type {
  EmployeeDetailDto,
  EmployeeSummaryDto,
  ListEmployeesFilter,
} from "./employee.types";

const summaryInclude = {
  user: {
    select: {
      role: true,
      telegramChatId: true,
      zaloUserId: true,
      notificationPreferences: true,
    },
  },
  primaryPosition: { select: { id: true, code: true, name: true } },
  skills: {
    include: { position: { select: { id: true, code: true, name: true } } },
    orderBy: { position: { sortOrder: "asc" as const } },
  },
  payRates: {
    orderBy: [{ effectiveFrom: "desc" as const }, { createdAt: "desc" as const }],
  },
} satisfies Prisma.EmployeeInclude;

const detailInclude = {
  ...summaryInclude,
  employmentHistory: {
    include: { recordedBy: { select: { email: true } } },
    orderBy: [{ effectiveDate: "desc" as const }, { createdAt: "desc" as const }],
  },
} satisfies Prisma.EmployeeInclude;

type SummaryRecord = Prisma.EmployeeGetPayload<{ include: typeof summaryInclude }>;
type DetailRecord = Prisma.EmployeeGetPayload<{ include: typeof detailInclude }>;

function resolveCurrentHourlyRate(
  payRates: Array<{ hourlyRate: bigint; effectiveTo: Date | null }>,
): string {
  const active = payRates.find((r) => r.effectiveTo === null) ?? payRates[0];
  return active ? active.hourlyRate.toString() : "0";
}

function mapSummary(row: SummaryRecord): EmployeeSummaryDto {
  return {
    id: row.id,
    userId: row.userId,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    phone: row.phone,
    email: row.email,
    role: row.user.role,
    hireDate: formatIsoDateOnly(row.hireDate),
    status: row.status,
    primaryPosition: row.primaryPosition,
    skills: row.skills.map((s) => ({
      positionId: s.positionId,
      positionCode: s.position.code,
      positionName: s.position.name,
      proficiency: s.proficiency,
    })),
    weeklyTargetHours: Number(row.weeklyTargetHours),
    maxWeeklyHours: Number(row.maxWeeklyHours),
    fixedRestDay: row.fixedRestDay,
    currentHourlyRate: resolveCurrentHourlyRate(row.payRates),
    telegramChatId: row.user.telegramChatId ?? null,
    zaloUserId: row.user.zaloUserId ?? null,
    notificationPreferences: normalizeNotificationPreferences(
      row.user.notificationPreferences,
    ),
  };
}

function mapDetail(
  row: DetailRecord,
  includeInternalNotes: boolean,
): EmployeeDetailDto {
  return {
    ...mapSummary(row),
    dateOfBirth: row.dateOfBirth ? formatIsoDateOnly(row.dateOfBirth) : null,
    terminationDate: row.terminationDate
      ? formatIsoDateOnly(row.terminationDate)
      : null,
    internalNotes: includeInternalNotes ? row.internalNotes : null,
    payRates: row.payRates.map((r) => ({
      id: r.id,
      hourlyRate: r.hourlyRate.toString(),
      effectiveFrom: formatIsoDateOnly(r.effectiveFrom),
      effectiveTo: r.effectiveTo ? formatIsoDateOnly(r.effectiveTo) : null,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
    employmentHistory: row.employmentHistory.map((h) => ({
      id: h.id,
      eventType: h.eventType,
      effectiveDate: formatIsoDateOnly(h.effectiveDate),
      summary: h.summary,
      recordedByEmail: h.recordedBy?.email ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}

export const employeeRepository = {
  async findMany(filter: ListEmployeesFilter = {}): Promise<EmployeeSummaryDto[]> {
    const where: Prisma.EmployeeWhereInput = {};

    if (filter.status && filter.status !== "ALL") {
      where.status = filter.status;
    }

    if (filter.positionId) {
      where.OR = [
        { primaryPositionId: filter.positionId },
        { skills: { some: { positionId: filter.positionId } } },
      ];
    }

    if (filter.search?.trim()) {
      const q = filter.search.trim();
      const searchCond: Prisma.EmployeeWhereInput = {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { employeeCode: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      };
      where.AND = where.AND
        ? Array.isArray(where.AND)
          ? [...where.AND, searchCond]
          : [where.AND, searchCond]
        : [searchCond];
    }

    const rows = await prisma.employee.findMany({
      where,
      include: summaryInclude,
      orderBy: [{ status: "asc" }, { employeeCode: "asc" }],
    });

    return rows.map(mapSummary);
  },

  async findDetailById(
    id: string,
    includeInternalNotes: boolean,
  ): Promise<EmployeeDetailDto | null> {
    const row = await prisma.employee.findUnique({
      where: { id },
      include: detailInclude,
    });
    return row ? mapDetail(row, includeInternalNotes) : null;
  },
};

