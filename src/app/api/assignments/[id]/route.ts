import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { scheduleAssignmentService } from "@/modules/schedules/schedule-assignment.service";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("schedules:manage");
    const { id } = await context.params;
    const result = await scheduleAssignmentService.remove(actor, id);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

