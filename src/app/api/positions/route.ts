import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { positionService } from "@/modules/positions/position.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("positions:read");
    const includeInactive =
      request.nextUrl.searchParams.get("includeInactive") === "true";
    const positions = await positionService.listPositions(actor, {
      includeInactive,
    });
    return apiSuccess(positions);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("positions:write");
    const body = await request.json();
    const created = await positionService.createPosition(actor, body);
    return apiSuccess(created, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

