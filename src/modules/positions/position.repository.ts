import { prisma } from "@/lib/prisma";
import type { PositionDto, ListPositionsFilter } from "./position.types";

function mapPositionRecord(record: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isPeakPriority: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { primaryEmployees: number; employeeSkills: number };
}): PositionDto {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    isPeakPriority: record.isPeakPriority,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    employeeCount: record._count.primaryEmployees,
    skilledCount: record._count.employeeSkills,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const positionRepository = {
  async findMany(filter: ListPositionsFilter = {}): Promise<PositionDto[]> {
    const rows = await prisma.position.findMany({
      where: filter.includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            primaryEmployees: true,
            employeeSkills: true,
          },
        },
      },
    });
    return rows.map(mapPositionRecord);
  },

  async findById(id: string): Promise<PositionDto | null> {
    const row = await prisma.position.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            primaryEmployees: true,
            employeeSkills: true,
          },
        },
      },
    });
    return row ? mapPositionRecord(row) : null;
  },

  async findByCodeOrName(code: string, name: string, excludeId?: string) {
    return prisma.position.findFirst({
      where: {
        OR: [
          { code: { equals: code, mode: "insensitive" } },
          { name: { equals: name, mode: "insensitive" } },
        ],
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
  },
};

