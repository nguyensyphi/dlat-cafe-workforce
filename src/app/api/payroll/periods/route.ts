import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { payrollService } from "@/modules/payroll/payroll.service";

export async function GET() {
  try {
    const actor = await requireApiSession("payroll:calculate");
    const list = await payrollService.listPeriods(actor);
    return apiSuccess(list);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("payroll:calculate");
    const body = await request.json();
    const created = await payrollService.createPeriod(actor, body);
    return apiSuccess(created, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

