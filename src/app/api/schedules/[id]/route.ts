import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { scheduleService } from "@/modules/schedules/schedule.service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("schedules:read");
    const { id } = await context.params;
    const schedule = await scheduleService.getById(actor, id);
    return apiSuccess(schedule);
  } catch (error) {
    return handleApiError(error);
  }
}

