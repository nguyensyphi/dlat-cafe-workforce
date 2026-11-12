import { NextRequest } from "next/server";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { getPublicScheduleRegistrationData } from "@/modules/availability/public-registration.service";
import { registrationRateLimiter } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

    const { searchParams } = new URL(request.url);
    const pin = searchParams.get("pin");

    // Protect 4-digit PIN verification from brute-force attempts
    if (pin) {
      const rateLimit = registrationRateLimiter.check(ipAddress);
      if (!rateLimit.success) {
        return apiError(
          "Bạn đã thử nhập mã PIN quá số lần cho phép. Vui lòng chờ 1 phút trước khi thử lại.",
          429,
        );
      }
    }

    const week = searchParams.get("week");
    const employeeId = searchParams.get("employeeId");

    const data = await getPublicScheduleRegistrationData(week, employeeId, pin);
    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}

