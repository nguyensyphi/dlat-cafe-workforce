import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  signSessionToken,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth";
import { AppUnauthorizedError, AppValidationError } from "@/lib/permissions";
import { recordAuditLog } from "@/modules/audit/audit.service";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập email")
    .email("Định dạng email không hợp lệ")
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const authService = {
  async login(
    rawInput: unknown,
    ipAddress?: string | null,
  ): Promise<{ user: SessionUser; token: string }> {
    const parsed = loginSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Thông tin đăng nhập không hợp lệ",
      );
    }

    const { email, password } = parsed.data;
    const dbUser = await prisma.user.findUnique({
      where: { email },
      include: {
        employee: {
          select: { id: true, fullName: true, status: true },
        },
      },
    });

    if (!dbUser) {
      throw new AppUnauthorizedError("Email hoặc mật khẩu không chính xác");
    }

    const valid = await verifyPassword(password, dbUser.passwordHash);
    if (!valid) {
      throw new AppUnauthorizedError("Email hoặc mật khẩu không chính xác");
    }

    if (!dbUser.isActive || dbUser.employee?.status === "INACTIVE") {
      throw new AppUnauthorizedError(
        "Tài khoản đã bị khóa hoặc ngừng hoạt động. Vui lòng liên hệ quản lý.",
      );
    }

    const sessionUser: SessionUser = {
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      employeeId: dbUser.employee?.id ?? null,
      fullName: dbUser.employee?.fullName ?? dbUser.email,
    };

    const token = await signSessionToken(sessionUser);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dbUser.id },
        data: { lastLoginAt: new Date() },
      });

      await recordAuditLog(
        {
          userId: dbUser.id,
          action: "AUTH_LOGIN",
          entityType: "User",
          entityId: dbUser.id,
          newValues: { email: dbUser.email, role: dbUser.role },
          ipAddress: ipAddress ?? null,
        },
        tx,
      );
    });

    return { user: sessionUser, token };
  },
};

