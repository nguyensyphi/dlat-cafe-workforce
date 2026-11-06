import { NextRequest } from "next/server";
import type { SwapStatus } from "@prisma/client";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { swapService } from "@/modules/swaps/swap.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:requests");
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status = statusParam ? (statusParam as SwapStatus) : undefined;

    const list = await swapService.listSwaps(actor, { status });
    return apiSuccess(list);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:requests");
    const body = await request.json();
    const created = await swapService.requestSwap(actor, body);
    return apiSuccess(created, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

