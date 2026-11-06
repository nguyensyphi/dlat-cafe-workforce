import { prisma } from "@/lib/prisma";
import { hashPassword, type SessionUser } from "@/lib/auth";
import { parseDateOnlyUtc } from "@/lib/date";
import {
  AppForbiddenError,
  AppNotFoundError,
  AppValidationError,
  assertPermission,
  assertSelfOrManager,
} from "@/lib/permissions";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { employeeRepository } from "./employee.repository";
import type {
  EmployeeDetailDto,
  EmployeeSummaryDto,
  ListEmployeesFilter,
} from "./employee.types";
import {
  addPayRateSchema,
  createEmployeeSchema,
  setEmployeeStatusSchema,
  updateEmployeeSchema,
  type AddPayRateInput,
  type CreateEmployeeInput,
  type SetEmployeeStatusInput,
  type UpdateEmployeeInput,
} from "./employee.validation";

export const employeeService = {
  async listEmployees(
    actor: SessionUser,
    filter: ListEmployeesFilter = {},
  ): Promise<EmployeeSummaryDto[]> {
    assertPermission(actor.role, "employees:read");
    return employeeRepository.findMany(filter);
  },

  async getEmployeeById(
    actor: SessionUser,
    id: string,
  ): Promise<EmployeeDetailDto> {
    assertSelfOrManager(actor, id);
    const includeInternalNotes =
      actor.role === "OWNER" || actor.role === "MANAGER";
    const dto = await employeeRepository.findDetailById(id, includeInternalNotes);
    if (!dto) {
      throw new AppNotFoundError("Không tìm thấy hồ sơ nhân viên");
    }
    return dto;
  },

  async createEmployee(
    actor: SessionUser,
    rawInput: CreateEmployeeInput,
  ): Promise<EmployeeDetailDto> {
    assertPermission(actor.role, "employees:write");

    const parsed = createEmployeeSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Dữ liệu hồ sơ nhân viên không hợp lệ",
      );
    }

    const data = parsed.data;

    const [dupCode, dupEmail, primaryPos] = await Promise.all([
      prisma.employee.findUnique({ where: { employeeCode: data.employeeCode } }),
      prisma.user.findUnique({ where: { email: data.email } }),
      prisma.position.findUnique({ where: { id: data.primaryPositionId } }),
    ]);

    if (dupCode) {
      throw new AppValidationError(
        `Mã nhân viên '${data.employeeCode}' đã tồn tại`,
      );
    }
    if (dupEmail) {
      throw new AppValidationError(`Email '${data.email}' đã được sử dụng`);
    }
    if (!primaryPos || !primaryPos.isActive) {
      throw new AppValidationError("Chức vụ chính không tồn tại hoặc đã ngừng hoạt động");
    }

    // Ensure primary position is included in skills list
    const skillsMap = new Map<string, "BASIC" | "INTERMEDIATE" | "ADVANCED">();
    for (const sk of data.skills) {
      skillsMap.set(sk.positionId, sk.proficiency);
    }
    if (!skillsMap.has(data.primaryPositionId)) {
      skillsMap.set(data.primaryPositionId, "INTERMEDIATE");
    }

    const passwordHash = await hashPassword(data.password);
    const hireDateUtc = parseDateOnlyUtc(data.hireDate);
    const dobUtc = data.dateOfBirth ? parseDateOnlyUtc(data.dateOfBirth) : null;

    const createdId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: data.role,
          isActive: true,
        },
      });

      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          employeeCode: data.employeeCode,
          fullName: data.fullName,
          phone: data.phone,
          email: data.email,
          dateOfBirth: dobUtc,
          hireDate: hireDateUtc,
          status: "ACTIVE",
          primaryPositionId: data.primaryPositionId,
          weeklyTargetHours: data.weeklyTargetHours,
          maxWeeklyHours: data.maxWeeklyHours,
          fixedRestDay: data.fixedRestDay ?? null,
          internalNotes: data.internalNotes ?? null,
        },
      });

      await tx.employeeSkill.createMany({
        data: Array.from(skillsMap.entries()).map(([positionId, proficiency]) => ({
          employeeId: employee.id,
          positionId,
          proficiency,
        })),
      });

      await tx.payRate.create({
        data: {
          employeeId: employee.id,
          hourlyRate: BigInt(data.hourlyRate),
          effectiveFrom: hireDateUtc,
          note: "Mức lương khởi điểm khi tạo hồ sơ",
          createdById: actor.userId,
        },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId: employee.id,
          eventType: "HIRED",
          effectiveDate: hireDateUtc,
          summary: `Tiếp nhận nhân viên mới vào vị trí ${primaryPos.name}`,
          details: {
            employeeCode: data.employeeCode,
            role: data.role,
            hourlyRate: data.hourlyRate,
          },
          recordedById: actor.userId,
        },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "EMPLOYEE_CREATED",
          entityType: "Employee",
          entityId: employee.id,
          newValues: {
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            email: employee.email,
            role: data.role,
            hourlyRate: data.hourlyRate,
          },
        },
        tx,
      );

      return employee.id;
    });

    const dto = await employeeRepository.findDetailById(createdId, true);
    if (!dto) {
      throw new AppNotFoundError("Không tìm thấy nhân viên vừa tạo");
    }
    return dto;
  },

  async updateEmployee(
    actor: SessionUser,
    id: string,
    rawInput: UpdateEmployeeInput,
  ): Promise<EmployeeDetailDto> {
    assertPermission(actor.role, "employees:write");

    const existing = await employeeRepository.findDetailById(id, true);
    if (!existing) {
      throw new AppNotFoundError("Không tìm thấy hồ sơ nhân viên");
    }

    const parsed = updateEmployeeSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Dữ liệu cập nhật nhân viên không hợp lệ",
      );
    }

    const data = parsed.data;
    const nextTarget = data.weeklyTargetHours ?? existing.weeklyTargetHours;
    const nextMax = data.maxWeeklyHours ?? existing.maxWeeklyHours;
    if (nextTarget > nextMax) {
      throw new AppValidationError(
        "Giờ mục tiêu mỗi tuần không được vượt quá giới hạn giờ tối đa tuần",
      );
    }

    if (
      data.role &&
      existing.userId === actor.userId &&
      data.role !== "OWNER"
    ) {
      throw new AppForbiddenError(
        "Chủ quán không thể tự hạ quyền tài khoản của chính mình",
      );
    }

    const nextPrimaryPosId =
      data.primaryPositionId ?? existing.primaryPosition.id;
    const nextPrimaryPos = await prisma.position.findUnique({
      where: { id: nextPrimaryPosId },
    });
    if (!nextPrimaryPos) {
      throw new AppValidationError("Chức vụ chính không tồn tại");
    }

    const newPasswordHash = data.newPassword
      ? await hashPassword(data.newPassword)
      : undefined;

    await prisma.$transaction(async (tx) => {
      if (data.role !== undefined || newPasswordHash !== undefined) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(data.role !== undefined ? { role: data.role } : {}),
            ...(newPasswordHash !== undefined
              ? { passwordHash: newPasswordHash }
              : {}),
          },
        });
      }

      await tx.employee.update({
        where: { id },
        data: {
          ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.dateOfBirth !== undefined
            ? {
                dateOfBirth: data.dateOfBirth
                  ? parseDateOnlyUtc(data.dateOfBirth)
                  : null,
              }
            : {}),
          ...(data.primaryPositionId !== undefined
            ? { primaryPositionId: data.primaryPositionId }
            : {}),
          ...(data.weeklyTargetHours !== undefined
            ? { weeklyTargetHours: data.weeklyTargetHours }
            : {}),
          ...(data.maxWeeklyHours !== undefined
            ? { maxWeeklyHours: data.maxWeeklyHours }
            : {}),
          ...(data.fixedRestDay !== undefined
            ? { fixedRestDay: data.fixedRestDay }
            : {}),
          ...(data.internalNotes !== undefined
            ? { internalNotes: data.internalNotes }
            : {}),
        },
      });

      if (data.skills !== undefined) {
        const skillsMap = new Map<
          string,
          "BASIC" | "INTERMEDIATE" | "ADVANCED"
        >();
        for (const sk of data.skills) {
          skillsMap.set(sk.positionId, sk.proficiency);
        }
        if (!skillsMap.has(nextPrimaryPosId)) {
          skillsMap.set(nextPrimaryPosId, "INTERMEDIATE");
        }

        await tx.employeeSkill.deleteMany({ where: { employeeId: id } });
        await tx.employeeSkill.createMany({
          data: Array.from(skillsMap.entries()).map(
            ([positionId, proficiency]) => ({
              employeeId: id,
              positionId,
              proficiency,
            }),
          ),
        });
      }

      if (
        data.primaryPositionId &&
        data.primaryPositionId !== existing.primaryPosition.id
      ) {
        await tx.employmentHistory.create({
          data: {
            employeeId: id,
            eventType: "POSITION_CHANGED",
            effectiveDate: new Date(),
            summary: `Chuyển chức vụ chính từ ${existing.primaryPosition.name} sang ${nextPrimaryPos.name}`,
            recordedById: actor.userId,
          },
        });
      }

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "EMPLOYEE_UPDATED",
          entityType: "Employee",
          entityId: id,
          oldValues: {
            fullName: existing.fullName,
            role: existing.role,
            primaryPosition: existing.primaryPosition.name,
            weeklyTargetHours: existing.weeklyTargetHours,
          },
          newValues: {
            fullName: data.fullName ?? existing.fullName,
            role: data.role ?? existing.role,
            primaryPosition: nextPrimaryPos.name,
            weeklyTargetHours: nextTarget,
          },
        },
        tx,
      );
    });

    const updated = await employeeRepository.findDetailById(id, true);
    if (!updated) {
      throw new AppNotFoundError("Không tìm thấy nhân viên sau khi cập nhật");
    }
    return updated;
  },

  async addPayRate(
    actor: SessionUser,
    employeeId: string,
    rawInput: AddPayRateInput,
  ): Promise<EmployeeDetailDto> {
    assertPermission(actor.role, "pay_rates:write");

    const existing = await employeeRepository.findDetailById(employeeId, true);
    if (!existing) {
      throw new AppNotFoundError("Không tìm thấy hồ sơ nhân viên");
    }

    const parsed = addPayRateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Thông tin mức lương không hợp lệ",
      );
    }

    const data = parsed.data;
    const effectiveFromUtc = parseDateOnlyUtc(data.effectiveFrom);
    const previousDayUtc = new Date(effectiveFromUtc.getTime());
    previousDayUtc.setUTCDate(previousDayUtc.getUTCDate() - 1);

    await prisma.$transaction(async (tx) => {
      // Close any currently open PayRate without overwriting historical records
      const openRates = await tx.payRate.findMany({
        where: { employeeId, effectiveTo: null },
      });

      for (const rate of openRates) {
        const closeDate =
          previousDayUtc >= rate.effectiveFrom
            ? previousDayUtc
            : effectiveFromUtc;
        await tx.payRate.update({
          where: { id: rate.id },
          data: { effectiveTo: closeDate },
        });
      }

      await tx.payRate.create({
        data: {
          employeeId,
          hourlyRate: BigInt(data.hourlyRate),
          effectiveFrom: effectiveFromUtc,
          effectiveTo: null,
          note: data.note ?? null,
          createdById: actor.userId,
        },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId,
          eventType: "WAGE_UPDATED",
          effectiveDate: effectiveFromUtc,
          summary: `Cập nhật mức lương từ ${existing.currentHourlyRate} ₫/h lên ${data.hourlyRate} ₫/h`,
          details: {
            oldHourlyRate: existing.currentHourlyRate,
            newHourlyRate: data.hourlyRate.toString(),
            note: data.note ?? null,
          },
          recordedById: actor.userId,
        },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "PAY_RATE_ADDED",
          entityType: "Employee",
          entityId: employeeId,
          oldValues: { hourlyRate: existing.currentHourlyRate },
          newValues: {
            hourlyRate: data.hourlyRate,
            effectiveFrom: data.effectiveFrom,
          },
          reason: data.note ?? null,
        },
        tx,
      );
    });

    const updated = await employeeRepository.findDetailById(employeeId, true);
    if (!updated) {
      throw new AppNotFoundError("Không tìm thấy nhân viên sau khi cập nhật lương");
    }
    return updated;
  },

  async setEmployeeStatus(
    actor: SessionUser,
    employeeId: string,
    rawInput: SetEmployeeStatusInput,
  ): Promise<EmployeeDetailDto> {
    assertPermission(actor.role, "employees:write");

    const existing = await employeeRepository.findDetailById(employeeId, true);
    if (!existing) {
      throw new AppNotFoundError("Không tìm thấy hồ sơ nhân viên");
    }

    const parsed = setEmployeeStatusSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Dữ liệu trạng thái không hợp lệ",
      );
    }

    const { status, reason } = parsed.data;
    if (status === "INACTIVE" && existing.userId === actor.userId) {
      throw new AppForbiddenError(
        "Bạn không thể tự vô hiệu hóa tài khoản đang đăng nhập của chính mình",
      );
    }

    const now = new Date();
    const isActivating = status === "ACTIVE";

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          status,
          terminationDate: isActivating ? null : now,
          deletedAt: isActivating ? null : now,
        },
      });

      await tx.user.update({
        where: { id: existing.userId },
        data: { isActive: isActivating },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId,
          eventType: isActivating ? "REACTIVATED" : "DEACTIVATED",
          effectiveDate: now,
          summary: isActivating
            ? `Kích hoạt lại nhân sự: ${reason}`
            : `Ngừng hoạt động nhân sự: ${reason}`,
          recordedById: actor.userId,
        },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: isActivating ? "EMPLOYEE_REACTIVATED" : "EMPLOYEE_DEACTIVATED",
          entityType: "Employee",
          entityId: employeeId,
          oldValues: { status: existing.status },
          newValues: { status },
          reason,
        },
        tx,
      );
    });

    const updated = await employeeRepository.findDetailById(employeeId, true);
    if (!updated) {
      throw new AppNotFoundError("Không tìm thấy hồ sơ nhân viên");
    }
    return updated;
  },
};

