import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { positionService } from "@/modules/positions/position.service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("positions:write");
    const { id } = await context.params;
    const body = await request.json();
    const updated = await positionService.updatePosition(actor, id, body);
    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

