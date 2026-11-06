import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { scheduleAssignmentService } from "@/modules/schedules/schedule-assignment.service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("schedules:manage");
    const { id } = await context.params;
    const candidates = await scheduleAssignmentService.listCandidates(actor, id);
    return apiSuccess(candidates);
  } catch (error) {
    return handleApiError(error);
  }
}

