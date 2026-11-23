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
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // Optional body — defaults to shift.endAt & standard reason
    }
    const updated = await attendanceService.quickFixClockOut(actor, id, body);
    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
