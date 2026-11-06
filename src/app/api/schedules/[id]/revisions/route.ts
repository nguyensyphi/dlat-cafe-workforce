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
    const revisions = await scheduleService.listRevisions(actor, id);
    return apiSuccess(revisions);
  } catch (error) {
    return handleApiError(error);
  }
}

