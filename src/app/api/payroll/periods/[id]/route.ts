import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { payrollService } from "@/modules/payroll/payroll.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("payroll:calculate");
    const { id } = await params;
    const detail = await payrollService.getPeriodDetail(actor, id);
    return apiSuccess(detail);
  } catch (error) {
    return handleApiError(error);
  }
}

