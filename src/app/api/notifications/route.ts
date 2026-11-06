import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession();
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          userId: actor.userId,
          ...(unreadOnly ? { isRead: false } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({
        where: { userId: actor.userId, isRead: false },
      }),
    ]);

    return apiSuccess({
      unreadCount,
      items: items.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        linkUrl: n.linkUrl,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession();
    const body = await request.json();
    const { id } = body;

    await prisma.notification.updateMany({
      where: { id, userId: actor.userId },
      data: { isRead: true, readAt: new Date() },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

