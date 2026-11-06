import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateNetShiftMinutes } from "@/lib/date";
import type {
  ListShiftTemplatesFilter,
  ShiftTemplateDto,
} from "./shift-template.types";

const templateInclude = {
  positionRequirements: {
    include: {
      position: { select: { id: true, code: true, name: true } },
    },
    orderBy: { position: { sortOrder: "asc" as const } },
  },
} satisfies Prisma.ShiftTemplateInclude;

type TemplateRecord = Prisma.ShiftTemplateGetPayload<{
  include: typeof templateInclude;
}>;

function mapTemplate(row: TemplateRecord): ShiftTemplateDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    startTime: row.startTime,
    endTime: row.endTime,
    breakMinutes: row.breakMinutes,
    netDurationMinutes: calculateNetShiftMinutes(
      row.startTime,
      row.endTime,
      row.breakMinutes,
    ),
    minStaff: row.minStaff,
    maxStaff: row.maxStaff,
    priority: row.priority,
    isPeak: row.isPeak,
    isActive: row.isActive,
    positionRequirements: row.positionRequirements.map((r) => ({
      positionId: r.positionId,
      positionCode: r.position.code,
      positionName: r.position.name,
      minCount: r.minCount,
      maxCount: r.maxCount,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const shiftTemplateRepository = {
  async findMany(
    filter: ListShiftTemplatesFilter = {},
  ): Promise<ShiftTemplateDto[]> {
    const rows = await prisma.shiftTemplate.findMany({
      where: filter.includeInactive ? undefined : { isActive: true },
      include: templateInclude,
      orderBy: [{ startTime: "asc" }, { name: "asc" }],
    });
    return rows.map(mapTemplate);
  },

  async findById(id: string): Promise<ShiftTemplateDto | null> {
    const row = await prisma.shiftTemplate.findUnique({
      where: { id },
      include: templateInclude,
    });
    return row ? mapTemplate(row) : null;
  },
};

