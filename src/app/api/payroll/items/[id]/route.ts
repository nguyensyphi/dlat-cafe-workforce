import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { payrollService } from "@/modules/payroll/payroll.service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("payroll:calculate");
    const { id } = await params;
    const body = await request.json();
    const item = await payrollService.updatePayrollItem(actor, id, body);
    return apiSuccess(item);
  } catch (error) {
    return handleApiError(error);
  }
}

