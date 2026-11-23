import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchExternalNotifications } from "@/modules/notifications/dispatcher";
import { normalizeNotificationPreferences } from "@/modules/notifications/notification.validation";
import { loadSettingsBundle } from "@/modules/settings/settings.service";

export async function POST() {
  try {
    const actor = await requireApiSession("settings:write");
    const bundle = await loadSettingsBundle();

    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        telegramChatId: true,
        zaloUserId: true,
        notificationPreferences: true,
        employee: {
          select: {
            fullName: true,
            phone: true,
          },
        },
      },
    });

    const recipient = user
      ? [
          {
            userId: user.id,
            fullName: user.employee?.fullName ?? actor.fullName,
            email: user.email,
            phone: user.employee?.phone ?? null,
            telegramChatId: user.telegramChatId,
            zaloUserId: user.zaloUserId,
            preferences: normalizeNotificationPreferences(
              user.notificationPreferences,
            ),
          },
        ]
      : [];

    const summary = await dispatchExternalNotifications({
      eventType: "SYSTEM_ALERT",
      title: "Kiểm tra kết nối thông báo D'Lat Cafe",
      message:
        "Tin nhắn kiểm tra gửi từ trang Cài đặt hệ thống. Nếu bạn nhận được tin này, kênh cảnh báo đa kênh đã kết nối thành công!",
      linkUrl: "/settings",
      policy: bundle.notificationPolicy,
      recipients: recipient,
      includeGroupTelegram: true,
      managerTelegramChatIds: bundle.notificationPolicy.managerTelegramChatIds,
    });

    return apiSuccess(summary);
  } catch (error) {
    return handleApiError(error);
  }
}
