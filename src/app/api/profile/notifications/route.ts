import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { employeeService } from "@/modules/employees/employee.service";

export async function GET() {
  try {
    const actor = await requireApiSession("self:profile");
    const settings = await employeeService.getSelfNotificationSettings(actor);
    return apiSuccess(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:profile");
    const body = await request.json();
    const updated = await employeeService.updateSelfNotificationSettings(
      actor,
      body,
    );
    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
