import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppNotFoundError } from "@/lib/permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireServerSession("self:attendance");
    const { id } = await params;

    const handover = await prisma.shiftHandover.findUnique({
      where: { id },
      include: {
        shift: {
          include: { template: true },
        },
        handoverEmployee: true,
        receivingEmployee: true,
        reviewerUser: { select: { email: true } },
      },
    });

    if (!handover) {
      throw new AppNotFoundError("Không tìm thấy phiếu bàn giao ca.");
    }

    return apiSuccess({ handover });
  } catch (error) {
    return handleApiError(error);
  }
}

