import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { scheduleShiftService } from "@/modules/schedules/schedule-shift.service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("schedules:manage");
    const { id } = await context.params;
    const body = await request.json();
    const updated = await scheduleShiftService.updateShift(actor, id, body);
    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("schedules:manage");
    const { id } = await context.params;
    const result = await scheduleShiftService.deleteShift(actor, id);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

