import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";
import { kioskRateLimiter } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const actor = await requireApiSession("attendance:manage");

    const rateLimit = kioskRateLimiter.check(actor.userId);
    if (!rateLimit.success) {
      return apiError("Kiosk đang làm mới quá nhanh. Vui lòng chờ vài giây.", 429);
    }

    let customBaseUrl: string | undefined;
    try {
      const body = await req.json();
      if (body?.baseUrl) customBaseUrl = String(body.baseUrl);
    } catch {}

    const result = await attendanceService.generateKioskToken(actor, customBaseUrl);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

