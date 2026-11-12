import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { handoverService } from "@/modules/handover/handover.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const updated = await handoverService.receiveHandover(
      id,
      body.receivingEmployeeId || actor.employeeId || "",
      body.notes,
      actor,
    );

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

