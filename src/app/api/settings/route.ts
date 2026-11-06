import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { settingsService } from "@/modules/settings/settings.service";

export async function GET() {
  try {
    const actor = await requireApiSession("settings:read");
    const settings = await settingsService.getSettings(actor);
    return apiSuccess(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireApiSession("settings:write");
    const body = await request.json();
    const updated = await settingsService.updateSettings(actor, body);
    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

