import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { listAuditLogs } from "@/modules/audit/audit.service";

export async function GET(request: NextRequest) {
  try {
    await requireApiSession("audit:read");
    const { searchParams } = new URL(request.url);

    const action = searchParams.get("action") || undefined;
    const entityType = searchParams.get("entityType") || undefined;
    const userId = searchParams.get("userId") || undefined;

    const logs = await listAuditLogs({ action, entityType, userId });
    return apiSuccess(logs);
  } catch (error) {
    return handleApiError(error);
  }
}

