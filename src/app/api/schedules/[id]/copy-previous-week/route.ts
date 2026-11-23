import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { scheduleService } from "@/modules/schedules/schedule.service";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("schedules:manage");
    const { id } = await context.params;
    const updated = await scheduleService.copyPreviousWeek(actor, id);
    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

