import { NextRequest } from "next/server";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";
import { attendanceRateLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:attendance");

    const rateLimit = attendanceRateLimiter.check(actor.userId);
    if (!rateLimit.success) {
      return apiError(
        "Bạn quét mã quá nhanh. Vui lòng đợi vài giây trước khi quét lại.",
        429
      );
    }

    const body = await request.json();
    const result = await attendanceService.recordScan(actor, body);
    return apiSuccess(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

