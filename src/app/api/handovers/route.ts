import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { handoverService } from "@/modules/handover/handover.service";
import { HandoverStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession("attendance:manage");
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const statusParam = searchParams.get("status") as HandoverStatus | null;

    const handovers = await handoverService.listHandovers(
      {
        workDate: dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : undefined,
        status: statusParam ?? undefined,
      },
      actor,
    );

    return apiSuccess({ handovers });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession("self:attendance");
    const body = await request.json();

    const result = await handoverService.submitHandover(body, actor);
    return apiSuccess({ handover: result }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

