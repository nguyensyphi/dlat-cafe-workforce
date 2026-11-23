import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { handoverService } from "@/modules/handover/handover.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("attendance:manage");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const result = await handoverService.confirmHandover(
      id,
      body.reviewNotes,
      actor,
    );

    return apiSuccess({ handover: result });
  } catch (error) {
    return handleApiError(error);
  }
}

