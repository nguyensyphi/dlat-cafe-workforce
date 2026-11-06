import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:attendance");
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const todayOnly = searchParams.get("today") === "true";

    if (todayOnly) {
      const status = await attendanceService.getMyTodayStatus(actor);
      return apiSuccess(status);
    }

    const list = await attendanceService.getMyAttendances(actor, {
      startDate,
      endDate,
    });

    return apiSuccess(list);
  } catch (error) {
    return handleApiError(error);
  }
}

