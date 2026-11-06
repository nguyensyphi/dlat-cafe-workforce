import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { todayDateStringVN } from "@/lib/date";
import { getWeekMondayDateString } from "@/lib/date";
import { availabilityService } from "@/modules/availability/availability.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:availability");
    const { searchParams } = new URL(request.url);
    const week = searchParams.get("week") || getWeekMondayDateString(todayDateStringVN());
    const targetEmployeeId = searchParams.get("employeeId") || undefined;

    const result = await availabilityService.getMyAvailability(
      actor,
      week,
      targetEmployeeId,
    );
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:availability");
    const { searchParams } = new URL(request.url);
    const targetEmployeeId = searchParams.get("employeeId") || undefined;
    const body = await request.json();

    const result = await availabilityService.submitAvailability(
      actor,
      body,
      targetEmployeeId,
    );
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

