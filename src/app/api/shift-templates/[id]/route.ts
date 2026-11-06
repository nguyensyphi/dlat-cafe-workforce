import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { shiftTemplateService } from "@/modules/shifts/shift-template.service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiSession("shifts:write");
    const { id } = await context.params;
    const body = await request.json();
    const updated = await shiftTemplateService.updateShiftTemplate(
      actor,
      id,
      body,
    );
    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

