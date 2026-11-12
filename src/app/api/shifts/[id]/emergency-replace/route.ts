import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { scheduleAssignmentService } from "@/modules/schedules/schedule-assignment.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("schedules:manage");
    const { id } = await context.params;
    const body = await request.json();
    const result = await scheduleAssignmentService.emergencyReplace(actor, id, body);
    return apiSuccess(result, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

