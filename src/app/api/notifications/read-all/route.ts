import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const actor = await requireApiSession();

    await prisma.notification.updateMany({
      where: { userId: actor.userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
