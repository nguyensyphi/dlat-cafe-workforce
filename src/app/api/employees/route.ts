import { NextRequest } from "next/server";
import type { EmployeeStatus } from "@prisma/client";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { employeeService } from "@/modules/employees/employee.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("employees:read");
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const statusParam = request.nextUrl.searchParams.get("status") ?? "ALL";
    const positionId =
      request.nextUrl.searchParams.get("positionId") ?? undefined;

    const status: EmployeeStatus | "ALL" =
      statusParam === "ACTIVE" || statusParam === "INACTIVE"
        ? statusParam
        : "ALL";

    const list = await employeeService.listEmployees(actor, {
      search,
      status,
      positionId,
    });
    return apiSuccess(list);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("employees:write");
    const body = await request.json();
    const created = await employeeService.createEmployee(actor, body);
    return apiSuccess(created, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

