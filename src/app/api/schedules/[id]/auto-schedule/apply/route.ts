import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { formatIsoDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { autoSchedulingService } from "@/modules/auto-scheduling/auto-scheduling.service";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("schedules:manage");
    const { id } = await context.params;

    const schedule = await prisma.schedule.findUniqueOrThrow({
      where: { id },
      select: { weekStart: true },
    });

    const weekStart = formatIsoDateOnly(schedule.weekStart);
    const result = await autoSchedulingService.applyRecommendation(
      actor,
      weekStart,
    );
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

