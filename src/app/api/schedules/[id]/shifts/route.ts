import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { scheduleShiftService } from "@/modules/schedules/schedule-shift.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("schedules:manage");
    const { id } = await context.params;
    const body = await request.json();
    const created = await scheduleShiftService.createShift(actor, id, body);
    return apiSuccess(created, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

