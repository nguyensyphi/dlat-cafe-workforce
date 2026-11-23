import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth";
import {
  AppForbiddenError,
  AppNotFoundError,
  AppUnauthorizedError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import { recordAuditLog } from "@/modules/audit/audit.service";

export function validatePasswordStrength(password: string): {
  valid: boolean;
  message?: string;
} {
  if (password.length < 8) {
    return { valid: false, message: "Mật khẩu mới phải có tối thiểu 8 ký tự" };
  }
  if (password.length > 100) {
    return { valid: false, message: "Mật khẩu mới tối đa 100 ký tự" };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: "Mật khẩu mới phải chứa ít nhất 1 chữ cái viết hoa (A-Z)",
    };
  }
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: "Mật khẩu mới phải chứa ít nhất 1 chữ cái viết thường (a-z)",
    };
  }
  if (!/\d/.test(password)) {
    return {
      valid: false,
      message: "Mật khẩu mới phải chứa ít nhất 1 chữ số (0-9)",
    };
  }
  return { valid: true };
}

export function validatePinFormat(pin: string): {
  valid: boolean;
  message?: string;
} {
  const trimmed = pin.trim();
  if (!/^\d{4,6}$/.test(trimmed)) {
    return {
      valid: false,
      message: "Mã PIN phải gồm từ 4 đến 6 chữ số (0-9)",
    };
  }
  if (/^(\d)\1+$/.test(trimmed)) {
    return {
      valid: false,
      message: "Mã PIN không được gồm toàn các chữ số giống nhau (ví dụ: 0000, 1111)",
    };
  }
  return { valid: true };
}

const strongPasswordSchema = z.string().superRefine((val, ctx) => {
  const check = validatePasswordStrength(val);
  if (!check.valid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: check.message ?? "Mật khẩu không đủ mạnh",
    });
  }
});

const pinSchema = z
  .string()
  .trim()
  .superRefine((val, ctx) => {
    const check = validatePinFormat(val);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: check.message ?? "Mã PIN không hợp lệ",
      });
    }
  });

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Vui lòng nhập lại mật khẩu mới"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp với mật khẩu mới",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    path: ["newPassword"],
  });

export const changeOwnPinSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Vui lòng nhập mật khẩu đăng nhập hiện tại để xác thực"),
    newPin: pinSchema,
    confirmPin: z.string().trim().min(1, "Vui lòng nhập lại mã PIN mới"),
  })
  .refine((data) => data.newPin === data.confirmPin, {
    message: "Mã PIN xác nhận không khớp",
    path: ["confirmPin"],
  });

export const resetEmployeeCredentialsSchema = z
  .object({
    newPassword: strongPasswordSchema.optional(),
    newPin: pinSchema.optional(),
    resetPinToDefault: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.newPassword !== undefined ||
      data.newPin !== undefined ||
      data.resetPinToDefault === true,
    {
      message:
        "Vui lòng nhập mật khẩu mới, mã PIN mới hoặc chọn khôi phục PIN mặc định",
    },
  );

export const credentialsService = {
  async changeOwnPassword(
    actor: SessionUser,
    rawInput: unknown,
    ipAddress?: string | null,
  ): Promise<{ updated: true }> {
    const parsed = changeOwnPasswordSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Thông tin đổi mật khẩu không hợp lệ",
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, email: true, passwordHash: true, isActive: true },
    });

    if (!dbUser || !dbUser.isActive) {
      throw new AppUnauthorizedError("Tài khoản không tồn tại hoặc đã bị khóa");
    }

    const matches = await verifyPassword(
      parsed.data.currentPassword,
      dbUser.passwordHash,
    );
    if (!matches) {
      throw new AppUnauthorizedError("Mật khẩu hiện tại không chính xác");
    }

    const newHash = await hashPassword(parsed.data.newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dbUser.id },
        data: { passwordHash: newHash },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "AUTH_PASSWORD_CHANGED",
          entityType: "User",
          entityId: dbUser.id,
          newValues: { selfChanged: true },
          ipAddress: ipAddress ?? null,
        },
        tx,
      );
    });

    return { updated: true };
  },

  async changeOwnPin(
    actor: SessionUser,
    rawInput: unknown,
    ipAddress?: string | null,
  ): Promise<{ updated: true; hasCustomPin: true }> {
    if (!actor.employeeId) {
      throw new AppForbiddenError(
        "Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên nên không có mã PIN đăng ký ca",
      );
    }

    const parsed = changeOwnPinSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Thông tin đổi mã PIN không hợp lệ",
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, passwordHash: true, isActive: true },
    });

    if (!dbUser || !dbUser.isActive) {
      throw new AppUnauthorizedError("Tài khoản không tồn tại hoặc đã bị khóa");
    }

    const matches = await verifyPassword(
      parsed.data.currentPassword,
      dbUser.passwordHash,
    );
    if (!matches) {
      throw new AppUnauthorizedError("Mật khẩu hiện tại không chính xác");
    }

    const newPinHash = await hashPassword(parsed.data.newPin);

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: actor.employeeId! },
        data: { pinHash: newPinHash },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "AUTH_PIN_CHANGED",
          entityType: "Employee",
          entityId: actor.employeeId!,
          newValues: { selfChanged: true, hasCustomPin: true },
          ipAddress: ipAddress ?? null,
        },
        tx,
      );
    });

    return { updated: true, hasCustomPin: true };
  },

  async resetEmployeeCredentials(
    actor: SessionUser,
    employeeId: string,
    rawInput: unknown,
    ipAddress?: string | null,
  ): Promise<{
    employeeId: string;
    passwordUpdated: boolean;
    pinUpdated: boolean;
    pinResetToDefault: boolean;
  }> {
    assertPermission(actor.role, "employees:write");

    const parsed = resetEmployeeCredentialsSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ??
          "Thông tin cấp lại mật khẩu / mã PIN không hợp lệ",
      );
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        userId: true,
        employeeCode: true,
        fullName: true,
      },
    });

    if (!employee) {
      throw new AppNotFoundError("Không tìm thấy hồ sơ nhân viên");
    }

    const data = parsed.data;
    const newPasswordHash = data.newPassword
      ? await hashPassword(data.newPassword)
      : undefined;
    const newPinHash = data.newPin
      ? await hashPassword(data.newPin)
      : data.resetPinToDefault
        ? null
        : undefined;

    await prisma.$transaction(async (tx) => {
      if (newPasswordHash !== undefined) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { passwordHash: newPasswordHash },
        });
      }

      if (newPinHash !== undefined) {
        await tx.employee.update({
          where: { id: employee.id },
          data: { pinHash: newPinHash },
        });
      }

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "EMPLOYEE_CREDENTIALS_RESET",
          entityType: "Employee",
          entityId: employee.id,
          newValues: {
            employeeCode: employee.employeeCode,
            passwordUpdated: newPasswordHash !== undefined,
            pinUpdated: data.newPin !== undefined,
            pinResetToDefault: Boolean(data.resetPinToDefault && !data.newPin),
          },
          ipAddress: ipAddress ?? null,
        },
        tx,
      );
    });

    return {
      employeeId: employee.id,
      passwordUpdated: newPasswordHash !== undefined,
      pinUpdated: data.newPin !== undefined,
      pinResetToDefault: Boolean(data.resetPinToDefault && !data.newPin),
    };
  },
};
