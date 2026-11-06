import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { employeeService } from "@/modules/employees/employee.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("pay_rates:write");
    const { id } = await context.params;
    const body = await request.json();
    const updated = await employeeService.addPayRate(actor, id, body);
    return apiSuccess(updated, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

