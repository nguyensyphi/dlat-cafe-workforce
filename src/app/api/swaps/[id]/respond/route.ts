import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { swapService } from "@/modules/swaps/swap.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("self:requests");
    const { id } = await context.params;
    const body = await request.json();
    const result = await swapService.respondToSwap(actor, id, body);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

