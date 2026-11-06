import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  AppNotFoundError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { positionRepository } from "./position.repository";
import type { ListPositionsFilter, PositionDto } from "./position.types";
import {
  createPositionSchema,
  updatePositionSchema,
  type CreatePositionInput,
  type UpdatePositionInput,
} from "./position.validation";

export const positionService = {
  async listPositions(
    actor: SessionUser,
    filter: ListPositionsFilter = {},
  ): Promise<PositionDto[]> {
    assertPermission(actor.role, "positions:read");
    return positionRepository.findMany(filter);
  },

  async createPosition(
    actor: SessionUser,
    rawInput: CreatePositionInput,
  ): Promise<PositionDto> {
    assertPermission(actor.role, "positions:write");

    const parsed = createPositionSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Thông tin vị trí không hợp lệ",
      );
    }

    const data = parsed.data;
    const duplicate = await positionRepository.findByCodeOrName(
      data.code,
      data.name,
    );
    if (duplicate) {
      throw new AppValidationError(
        `Mã vị trí '${data.code}' hoặc tên '${data.name}' đã tồn tại`,
      );
    }

    const createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.position.create({
        data: {
          code: data.code,
          name: data.name,
          description: data.description ?? null,
          isPeakPriority: data.isPeakPriority,
          sortOrder: data.sortOrder,
          isActive: true,
        },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "POSITION_CREATED",
          entityType: "Position",
          entityId: created.id,
          newValues: {
            code: created.code,
            name: created.name,
            isPeakPriority: created.isPeakPriority,
          },
        },
        tx,
      );

      return created.id;
    });

    const dto = await positionRepository.findById(createdId);
    if (!dto) {
      throw new AppNotFoundError("Không tìm thấy vị trí vừa tạo");
    }
    return dto;
  },

  async updatePosition(
    actor: SessionUser,
    id: string,
    rawInput: UpdatePositionInput,
  ): Promise<PositionDto> {
    assertPermission(actor.role, "positions:write");

    const existing = await positionRepository.findById(id);
    if (!existing) {
      throw new AppNotFoundError("Không tìm thấy vị trí công việc");
    }

    const parsed = updatePositionSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppValidationError(
        parsed.error.issues[0]?.message ?? "Dữ liệu cập nhật vị trí không hợp lệ",
      );
    }

    const data = parsed.data;
    if (data.name && data.name !== existing.name) {
      const duplicate = await positionRepository.findByCodeOrName(
        "__NONE__",
        data.name,
        id,
      );
      if (duplicate) {
        throw new AppValidationError(`Tên vị trí '${data.name}' đã tồn tại`);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.position.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
          ...(data.isPeakPriority !== undefined
            ? { isPeakPriority: data.isPeakPriority }
            : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "POSITION_UPDATED",
          entityType: "Position",
          entityId: id,
          oldValues: {
            name: existing.name,
            isActive: existing.isActive,
            isPeakPriority: existing.isPeakPriority,
          },
          newValues: data,
        },
        tx,
      );
    });

    const updated = await positionRepository.findById(id);
    if (!updated) {
      throw new AppNotFoundError("Không tìm thấy vị trí sau khi cập nhật");
    }
    return updated;
  },
};

