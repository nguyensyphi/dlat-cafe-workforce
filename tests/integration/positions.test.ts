import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppForbiddenError, AppValidationError } from "@/lib/permissions";
import { positionService } from "@/modules/positions/position.service";
import type { SessionUser } from "@/lib/auth";

let ownerActor: SessionUser;
let managerActor: SessionUser;
let employeeActor: SessionUser;

describe("Position Management Integration Tests", () => {
  beforeAll(async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "owner@dlatcafe.vn" },
      include: { employee: true },
    });
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: "manager@dlatcafe.vn" },
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
      employeeId: owner.employee?.id ?? null,
      fullName: owner.employee?.fullName ?? "Chủ quán",
    };
    managerActor = {
      userId: manager.id,
      email: manager.email,
      role: manager.role,
      employeeId: manager.employee?.id ?? null,
      fullName: manager.employee?.fullName ?? "Quản lý",
    };
    employeeActor = {
      userId: emp.id,
      email: emp.email,
      role: emp.role,
      employeeId: emp.employee?.id ?? null,
      fullName: emp.employee?.fullName ?? "Nhân viên",
    };
  });

  it("lists all seeded coffee shop positions for MANAGER and OWNER", async () => {
    const list = await positionService.listPositions(managerActor, {
      includeInactive: true,
    });
    expect(list.length).toBeGreaterThanOrEqual(6);
    const names = list.map((p) => p.name);
    expect(names).toContain("Pha chế");
    expect(names).toContain("Thu ngân");
  });

  it("blocks EMPLOYEE from creating or modifying positions", async () => {
    await expect(
      positionService.createPosition(employeeActor, {
        code: "BAO_VE_TEST",
        name: "Bảo vệ Test",
        description: "Trông xe",
        isPeakPriority: false,
        sortOrder: 10,
      }),
    ).rejects.toThrow(AppForbiddenError);
  });

  it("allows OWNER to create, update, and deactivate a position while logging audit trail", async () => {
    const uniqueSuffix = Date.now().toString().slice(-5);
    const created = await positionService.createPosition(ownerActor, {
      code: `BAO_VE_${uniqueSuffix}`,
      name: `Trông xe ${uniqueSuffix}`,
      description: "Hỗ trợ dắt xe cho khách giờ cao điểm",
      isPeakPriority: false,
      sortOrder: 99,
    });

    expect(created.id).toBeDefined();
    expect(created.isActive).toBe(true);

    const updated = await positionService.updatePosition(
      ownerActor,
      created.id,
      {
        name: `Bảo vệ & Trông xe ${uniqueSuffix}`,
        isActive: false,
      },
    );
    expect(updated.isActive).toBe(false);
    expect(updated.name).toBe(`Bảo vệ & Trông xe ${uniqueSuffix}`);

    // Cleanup test position that has no historical references
    await prisma.position.delete({ where: { id: created.id } });
  });

  it("rejects duplicate position code or empty name", async () => {
    await expect(
      positionService.createPosition(ownerActor, {
        code: "PHA_CHE",
        name: "Pha chế trùng",
        isPeakPriority: true,
        sortOrder: 5,
      }),
    ).rejects.toThrow(AppValidationError);
  });
});

