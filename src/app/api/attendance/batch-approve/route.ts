import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("attendance:manage");
    const body = await request.json().catch(() => ({}));
    const attendanceIds = Array.isArray(body.attendanceIds) ? body.attendanceIds : [];

    if (attendanceIds.length === 0) {
      return apiSuccess({ approvedCount: 0, errors: ["Danh sách ID trống"] });
    }

    const result = await attendanceService.batchApproveAttendances(actor, attendanceIds);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

