import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { payrollService } from "@/modules/payroll/payroll.service";

export async function GET() {
  try {
    const actor = await requireApiSession("self:payroll");
    const history = await payrollService.getMyPayrollHistory(actor);
    return apiSuccess(history);
  } catch (error) {
    return handleApiError(error);
  }
}

