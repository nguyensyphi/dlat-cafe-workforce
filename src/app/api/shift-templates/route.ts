import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { shiftTemplateService } from "@/modules/shifts/shift-template.service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("shifts:read");
    const includeInactive =
      request.nextUrl.searchParams.get("includeInactive") === "true";
    const list = await shiftTemplateService.listShiftTemplates(actor, {
      includeInactive,
    });
    return apiSuccess(list);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("shifts:write");
    const body = await request.json();
    const created = await shiftTemplateService.createShiftTemplate(actor, body);
    return apiSuccess(created, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

