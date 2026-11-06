import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { scheduleService } from "@/modules/schedules/schedule.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("schedules:read");
    const { searchParams } = new URL(request.url);
    const week = searchParams.get("week");

    if (week) {
      const schedule = await scheduleService.getWeek(actor, week);
      return apiSuccess(schedule);
    }

    const list = await scheduleService.listRecent(actor);
    return apiSuccess(list);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("schedules:manage");
    const body = await request.json();
    const created = await scheduleService.createWeek(actor, body);
    return apiSuccess(created, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

