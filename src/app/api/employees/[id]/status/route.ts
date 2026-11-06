import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { employeeService } from "@/modules/employees/employee.service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("employees:write");
    const { id } = await context.params;
    const body = await request.json();
    const updated = await employeeService.setEmployeeStatus(actor, id, body);
    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

