import { NextRequest } from "next/server";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { payrollService } from "@/modules/payroll/payroll.service";
import { calculationRateLimiter } from "@/lib/rate-limit";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("payroll:calculate");

    const rateLimit = calculationRateLimiter.check(actor.userId);
    if (!rateLimit.success) {
      return apiError(
        "Đang tính toán bảng lương, vui lòng chờ ít phút trước khi tính lại.",
        429
      );
    }

    const { id } = await params;
    const detail = await payrollService.calculatePeriod(actor, id);
    return apiSuccess(detail);
  } catch (error) {
    return handleApiError(error);
  }
}

