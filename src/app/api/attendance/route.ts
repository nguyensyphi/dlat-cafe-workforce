import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("attendance:manage");
    const { searchParams } = new URL(request.url);

    const workDate = searchParams.get("workDate") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const statusParam = searchParams.get("status");
    const status = (statusParam as "PENDING" | "APPROVED" | "REJECTED") || undefined;
    const employeeId = searchParams.get("employeeId") || undefined;

    const list = await attendanceService.listAttendances(actor, {
      workDate,
      startDate,
      endDate,
      status,
      employeeId,
    });

    return apiSuccess(list);
  } catch (error) {
    return handleApiError(error);
  }
}

