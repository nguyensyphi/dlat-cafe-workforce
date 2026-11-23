import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { employeeService } from "@/modules/employees/employee.service";
import {
  createNotifications,
  createNotificationsWithDedupeReport,
} from "@/modules/notifications/notification.service";
import {
  getNotificationPolicy,
  settingsService,
  type SystemSettingsBundle,
} from "@/modules/settings/settings.service";

let ownerActor: SessionUser;
let employeeActor: SessionUser;
let originalBundle: SystemSettingsBundle;
let originalEmpNotif: {
  telegramChatId: string | null;
  zaloUserId: string | null;
  notificationPreferences: Prisma.JsonValue | null;
};

const createdNotificationIds: string[] = [];
const runTag = `notif-core-${Date.now()}`;

describe("M2 Notification Core Integration Tests (PostgreSQL)", () => {
  beforeAll(async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "owner@dlatcafe.vn" },
      include: { employee: true },
    });
    const emp = await prisma.user.findUniqueOrThrow({
      where: { email: "nam.le@dlatcafe.vn" },
      include: { employee: true },
    });

    ownerActor = {
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      employeeId: owner.employee!.id,
      fullName: owner.employee!.fullName,
    };
    employeeActor = {
      userId: emp.id,
      email: emp.email,
      role: emp.role,
      employeeId: emp.employee!.id,
      fullName: emp.employee!.fullName,
    };

    originalEmpNotif = {
      telegramChatId: emp.telegramChatId,
      zaloUserId: emp.zaloUserId,
      notificationPreferences: emp.notificationPreferences,
    };
    originalBundle = await settingsService.getSettings(ownerActor);
  });

  afterAll(async () => {
    // Restore original settings & employee notification fields and clean up test rows
    await settingsService.updateSettings(ownerActor, originalBundle);
    await prisma.user.update({
      where: { id: employeeActor.userId },
      data: {
        telegramChatId: originalEmpNotif.telegramChatId,
        zaloUserId: originalEmpNotif.zaloUserId,
        notificationPreferences:
          originalEmpNotif.notificationPreferences === null
            ? Prisma.DbNull
            : (originalEmpNotif.notificationPreferences as Prisma.InputJsonValue),
      },
    });
    if (createdNotificationIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: createdNotificationIds } },
      });
    }
    await prisma.notification.deleteMany({
      where: { dedupeKey: { startsWith: runTag } },
    });
  });

  it("enforces Notification.dedupeKey uniqueness via skipDuplicates while allowing multiple null dedupeKeys", async () => {
    const key1 = `${runTag}:shift-rem:1`;

    const firstCount = await createNotifications(prisma, [
      {
        userId: employeeActor.userId,
        type: "SHIFT_REMINDER",
        title: "Nhắc ca làm việc",
        message: "15 phút nữa vào Ca 1",
        dedupeKey: key1,
      },
    ]);
    expect(firstCount).toBe(1);

    const dupCount = await createNotifications(prisma, [
      {
        userId: employeeActor.userId,
        type: "SHIFT_REMINDER",
        title: "Nhắc ca làm việc",
        message: "15 phút nữa vào Ca 1",
        dedupeKey: key1,
      },
    ]);
    expect(dupCount).toBe(0);

    const key2 = `${runTag}:shift-rem:2`;
    const report = await createNotificationsWithDedupeReport(prisma, [
      {
        userId: employeeActor.userId,
        type: "SHIFT_REMINDER",
        title: "Nhắc ca",
        message: "Trùng key1",
        dedupeKey: key1,
      },
      {
        userId: employeeActor.userId,
        type: "SHIFT_REMINDER",
        title: "Nhắc tan ca",
        message: "15 phút nữa tan Ca 1",
        dedupeKey: key2,
      },
    ]);
    expect(report).toEqual({
      count: 1,
      insertedDedupeKeys: [key2],
    });

    // Multiple notifications with null dedupeKey must coexist without unique conflict
    const nullKeyCount = await createNotifications(prisma, [
      {
        userId: employeeActor.userId,
        type: "SCHEDULE_PUBLISHED",
        title: `${runTag} A`,
        message: "Msg A",
      },
      {
        userId: employeeActor.userId,
        type: "SCHEDULE_UPDATED",
        title: `${runTag} B`,
        message: "Msg B",
      },
    ]);
    expect(nullKeyCount).toBe(2);

    const createdNullRows = await prisma.notification.findMany({
      where: {
        userId: employeeActor.userId,
        title: { startsWith: runTag },
      },
      select: { id: true },
    });
    createdNotificationIds.push(...createdNullRows.map((r) => r.id));
  });

  it("persists and reloads notificationPolicy via settingsService without breaking legacy 4-key updates", async () => {
    const updated = await settingsService.updateSettings(ownerActor, {
      ...originalBundle,
      notificationPolicy: {
        enableTelegram: true,
        enableZalo: false,
        enableEmail: true,
        managerTelegramChatIds: ["10001", "10002"],
        groupTelegramChatId: "-100999888",
        shiftStartReminderMinutes: 20,
        shiftEndReminderMinutes: 10,
        cashDiscrepancyThresholdVnd: 15000,
      },
    });

    expect(updated.notificationPolicy).toEqual({
      enableTelegram: true,
      enableZalo: false,
      enableEmail: true,
      managerTelegramChatIds: ["10001", "10002"],
      groupTelegramChatId: "-100999888",
      shiftStartReminderMinutes: 20,
      shiftEndReminderMinutes: 10,
      cashDiscrepancyThresholdVnd: 15000,
    });

    const policy = await getNotificationPolicy();
    expect(policy.cashDiscrepancyThresholdVnd).toBe(15000);
    expect(policy.groupTelegramChatId).toBe("-100999888");
  });

  it("updates self notification contact & channel preferences and records an AuditLog", async () => {
    const updated = await employeeService.updateSelfNotificationSettings(
      employeeActor,
      {
        telegramChatId: "555666777",
        zaloUserId: "zalo-nam-le",
        notificationPreferences: {
          telegram: true,
          zalo: false,
          email: true,
        },
      },
    );

    expect(updated.telegramChatId).toBe("555666777");
    expect(updated.zaloUserId).toBe("zalo-nam-le");
    expect(updated.notificationPreferences).toEqual({
      telegram: true,
      zalo: false,
      email: true,
    });

    const fetched = await employeeService.getSelfNotificationSettings(
      employeeActor,
    );
    expect(fetched).toEqual(updated);

    const profile = await employeeService.getEmployeeById(
      employeeActor,
      employeeActor.employeeId!,
    );
    expect(profile.telegramChatId).toBe("555666777");
    expect(profile.zaloUserId).toBe("zalo-nam-le");
    expect(profile.notificationPreferences.zalo).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: employeeActor.userId,
        action: "PROFILE_NOTIFICATIONS_UPDATED",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
  });
});
