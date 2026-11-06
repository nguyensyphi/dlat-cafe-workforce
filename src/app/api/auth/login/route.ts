import { NextRequest } from "next/server";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { SESSION_COOKIE_NAME, getSessionTtlSeconds } from "@/lib/auth";
import { authService } from "@/modules/auth/auth.service";
import { authRateLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

    const rateLimit = authRateLimiter.check(ipAddress);
    if (!rateLimit.success) {
      return apiError(
        "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ 1 phút trước khi thử lại.",
        429
      );
    }

    const body = await request.json();
    const { user, token } = await authService.login(body, ipAddress);
    const redirectTo =
      user.role === "EMPLOYEE" ? "/employee/profile" : "/dashboard";

    const response = apiSuccess({ user, redirectTo });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionTtlSeconds(),
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

