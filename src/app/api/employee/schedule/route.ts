import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { todayDateStringVN } from "@/lib/date";
import { getWeekMondayDateString } from "@/lib/date";
import { scheduleService } from "@/modules/schedules/schedule.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:schedule");
    const { searchParams } = new URL(request.url);
    const week = searchParams.get("week") || getWeekMondayDateString(todayDateStringVN());

    const result = await scheduleService.getMyWeek(actor, week);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

