import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("attendance:manage");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const updated = await attendanceService.approveAttendance(
      actor,
      id,
      body.approvedMinutes,
      body.paidMinutes,
    );

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

