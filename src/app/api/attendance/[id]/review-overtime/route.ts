import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("attendance:manage");
    const { id } = await context.params;
    const body = await request.json();
    const approved = Boolean(body.approved);
    const note = body.note ? String(body.note) : undefined;

    const updated = await attendanceService.reviewOvertime(actor, id, approved, note);
    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

