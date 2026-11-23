import { NextRequest } from "next/server";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { getServerSession } from "@/lib/auth";
import { attendanceMonitorService } from "@/modules/attendance/attendance-monitor.service";

async function authorizeCronOrManager(request: NextRequest) {
  const xCronSecret = request.headers.get("x-cron-secret");
  const authHeader = request.headers.get("authorization");
  const hasBearer =
    typeof authHeader === "string" && /^Bearer\s+/i.test(authHeader);

  if (xCronSecret !== null || hasBearer) {
    const providedToken =
      xCronSecret?.trim() ||
      authHeader?.replace(/^Bearer\s+/i, "").trim() ||
      "";
    const expectedSecret = process.env.CRON_SECRET?.trim() ?? "";

    if (expectedSecret.length > 0 && providedToken === expectedSecret) {
      return { authorized: true as const };
    }
    return {
      authorized: false as const,
      response: apiError(
        "Mã xác thực cron không hợp lệ",
        401,
        "UNAUTHORIZED",
      ),
    };
  }

  const session = await getServerSession();
  if (!session) {
    return {
      authorized: false as const,
      response: apiError(
        "Vui lòng đăng nhập hoặc cung cấp CRON_SECRET",
        401,
        "UNAUTHORIZED",
      ),
    };
  }

  if (session.role !== "OWNER" && session.role !== "MANAGER") {
    return {
      authorized: false as const,
      response: apiError(
        "Chỉ Quản lý hoặc Chủ quán mới có quyền kích hoạt kiểm tra bất thường chấm công",
        403,
        "FORBIDDEN",
      ),
    };
  }

  return { authorized: true as const };
}

async function resolveNowOverride(
  request: NextRequest,
): Promise<Date | undefined> {
  const { searchParams } = new URL(request.url);
  let nowRaw = searchParams.get("now")?.trim();

  if (!nowRaw && request.method === "POST") {
    try {
      const body = (await request.json()) as { now?: unknown } | null;
      if (body && typeof body.now === "string" && body.now.trim().length > 0) {
        nowRaw = body.now.trim();
      }
    } catch {
      // Optional JSON body may be empty
    }
  }

  if (!nowRaw) return undefined;
  const parsed = new Date(nowRaw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function handleAnomalyCronRequest(request: NextRequest) {
  try {
    const auth = await authorizeCronOrManager(request);
    if (!auth.authorized) {
      return auth.response;
    }
    const now = await resolveNowOverride(request);
    const summary = await attendanceMonitorService.runAttendanceAnomalyMonitor({
      now,
    });
    return apiSuccess(summary);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  return handleAnomalyCronRequest(request);
}

export async function POST(request: NextRequest) {
  return handleAnomalyCronRequest(request);
}
