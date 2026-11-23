import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { credentialsService } from "@/modules/auth/credentials.service";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession();
    const body = await request.json();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const result = await credentialsService.changeOwnPassword(actor, body, ip);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
