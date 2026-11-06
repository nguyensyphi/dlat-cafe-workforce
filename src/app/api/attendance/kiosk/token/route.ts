import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";
import { kioskRateLimiter } from "@/lib/rate-limit";

export async function POST() {
  try {
    const actor = await requireApiSession("attendance:manage");

    const rateLimit = kioskRateLimiter.check(actor.userId);
    if (!rateLimit.success) {
      return apiError("Kiosk đang làm mới quá nhanh. Vui lòng chờ vài giây.", 429);
    }

    const result = await attendanceService.generateKioskToken(actor);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

