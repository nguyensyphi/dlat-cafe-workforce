import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { leaveService } from "@/modules/leaves/leave.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:requests");
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status =
      statusParam === "APPROVED" ||
      statusParam === "REJECTED" ||
      statusParam === "PENDING"
        ? statusParam
        : undefined;

    const list = await leaveService.listLeaveRequests(actor, { status });
    return apiSuccess(list);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:requests");
    const body = await request.json();
    const created = await leaveService.submitLeaveRequest(actor, body);
    return apiSuccess(created, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
