import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { attendanceMonitorService } from "@/modules/attendance/attendance-monitor.service";

export async function GET(request: NextRequest) {
  try {
    await requireApiSession("attendance:manage");
    const { searchParams } = new URL(request.url);
    const workDate = searchParams.get("date")?.trim() || undefined;
    const alerts = await attendanceMonitorService.getActiveAttendanceAlerts({
      workDate,
    });
    return apiSuccess(alerts);
  } catch (error) {
    return handleApiError(error);
  }
}
