import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { calculateNetShiftMinutes } from "@/lib/date";
import {
  AppNotFoundError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { shiftTemplateRepository } from "./shift-template.repository";
import type {
  ListShiftTemplatesFilter,
  ShiftTemplateDto,
} from "./shift-template.types";
import {
  createShiftTemplateSchema,
  updateShiftTemplateSchema,
  type CreateShiftTemplateInput,
  type UpdateShiftTemplateInput,
} from "./shift-template.validation";

export const shiftTemplateService = {
  async listShiftTemplates(
    actor: SessionUser,
    filter: ListShiftTemplatesFilter = {},
  ): Promise<ShiftTemplateDto[]> {
    assertPermission(actor.role, "shifts:read");
    return shiftTemplateRepository.findMany(filter);
  },

  async createShiftTemplate(
    actor: SessionUser,
    rawInput: CreateShiftTemplateInput,
  ): Promise<ShiftTemplateDto> {
    assertPermission(actor.role, "shifts:write");

    const parsed = createShiftTemplateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Cấu hình ca làm không hợp lệ",
      );
    }

    const data = parsed.data;
    const duplicate = await prisma.shiftTemplate.findUnique({
      where: { code: data.code },
    });
    if (duplicate) {
      throw new AppValidationError(`Mã ca '${data.code}' đã tồn tại`);
    }

    const createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.shiftTemplate.create({
        data: {
          code: data.code,
          name: data.name,
          startTime: data.startTime,
          endTime: data.endTime,
          breakMinutes: data.breakMinutes,
          minStaff: data.minStaff,
          maxStaff: data.maxStaff,
          priority: data.priority,
          isPeak: data.isPeak,
          isActive: true,
        },
      });

      const validReqs = data.positionRequirements.filter((r) => r.minCount > 0);
      if (validReqs.length > 0) {
        await tx.shiftTemplateRequirement.createMany({
          data: validReqs.map((r) => ({
            templateId: created.id,
            positionId: r.positionId,
            minCount: r.minCount,
            maxCount: r.maxCount ?? null,
          })),
        });
      }

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SHIFT_TEMPLATE_CREATED",
          entityType: "ShiftTemplate",
          entityId: created.id,
          newValues: {
            code: created.code,
            name: created.name,
            startTime: created.startTime,
            endTime: created.endTime,
            minStaff: created.minStaff,
            maxStaff: created.maxStaff,
          },
        },
        tx,
      );

      return created.id;
    });

    const dto = await shiftTemplateRepository.findById(createdId);
    if (!dto) {
      throw new AppNotFoundError("Không tìm thấy ca mẫu vừa tạo");
    }
    return dto;
  },

  async updateShiftTemplate(
    actor: SessionUser,
    id: string,
    rawInput: UpdateShiftTemplateInput,
  ): Promise<ShiftTemplateDto> {
    assertPermission(actor.role, "shifts:write");

    const existing = await shiftTemplateRepository.findById(id);
    if (!existing) {
      throw new AppNotFoundError("Không tìm thấy ca làm mẫu");
    }

    const parsed = updateShiftTemplateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Dữ liệu cập nhật ca làm không hợp lệ",
      );
    }

    const data = parsed.data;
    const nextStart = data.startTime ?? existing.startTime;
    const nextEnd = data.endTime ?? existing.endTime;
    const nextBreak = data.breakMinutes ?? existing.breakMinutes;
    const nextMin = data.minStaff ?? existing.minStaff;
    const nextMax = data.maxStaff ?? existing.maxStaff;

    if (nextMin > nextMax) {
      throw new AppValidationError(
        "Số nhân viên tối thiểu không được lớn hơn số tối đa",
      );
    }

    try {
      calculateNetShiftMinutes(nextStart, nextEnd, nextBreak);
    } catch (err) {
      throw new AppValidationError(
        err instanceof Error ? err.message : "Thời lượng ca không hợp lệ",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.shiftTemplate.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
          ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
          ...(data.breakMinutes !== undefined
            ? { breakMinutes: data.breakMinutes }
            : {}),
          ...(data.minStaff !== undefined ? { minStaff: data.minStaff } : {}),
          ...(data.maxStaff !== undefined ? { maxStaff: data.maxStaff } : {}),
          ...(data.priority !== undefined ? { priority: data.priority } : {}),
          ...(data.isPeak !== undefined ? { isPeak: data.isPeak } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });

      if (data.positionRequirements !== undefined) {
        await tx.shiftTemplateRequirement.deleteMany({
          where: { templateId: id },
        });
        const validReqs = data.positionRequirements.filter(
          (r) => r.minCount > 0,
        );
        if (validReqs.length > 0) {
          await tx.shiftTemplateRequirement.createMany({
            data: validReqs.map((r) => ({
              templateId: id,
              positionId: r.positionId,
              minCount: r.minCount,
              maxCount: r.maxCount ?? null,
            })),
          });
        }
      }

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "SHIFT_TEMPLATE_UPDATED",
          entityType: "ShiftTemplate",
          entityId: id,
          oldValues: {
            name: existing.name,
            startTime: existing.startTime,
            endTime: existing.endTime,
            isActive: existing.isActive,
          },
          newValues: {
            name: data.name ?? existing.name,
            startTime: nextStart,
            endTime: nextEnd,
            isActive: data.isActive ?? existing.isActive,
          },
        },
        tx,
      );
    });

    const updated = await shiftTemplateRepository.findById(id);
    if (!updated) {
      throw new AppNotFoundError("Không tìm thấy ca mẫu sau khi cập nhật");
    }
    return updated;
  },
};

