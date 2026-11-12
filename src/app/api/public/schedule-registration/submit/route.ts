import { NextRequest } from "next/server";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { submitPublicScheduleRegistration } from "@/modules/availability/public-registration.service";
import { registrationRateLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

    const rateLimit = registrationRateLimiter.check(ipAddress);
    if (!rateLimit.success) {
      return apiError(
        "Bạn đã gửi quá nhiều yêu cầu đăng ký ca. Vui lòng chờ 1 phút trước khi thử lại.",
        429,
      );
    }

    const body = await request.json();
    const result = await submitPublicScheduleRegistration(body);
    return apiSuccess(result, 201);
  } catch (error: any) {
    return handleApiError(error);
  }
}

