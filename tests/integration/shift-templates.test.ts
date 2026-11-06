import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppForbiddenError, AppValidationError } from "@/lib/permissions";
import { shiftTemplateService } from "@/modules/shifts/shift-template.service";
import type { SessionUser } from "@/lib/auth";

let ownerActor: SessionUser;
let employeeActor: SessionUser;
let baristaPositionId: string;

describe("Shift Template Configuration Integration Tests", () => {
  beforeAll(async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "owner@dlatcafe.vn" },
      include: { employee: true },
    });
    const emp = await prisma.user.findUniqueOrThrow({
      where: { email: "nam.le@dlatcafe.vn" },
      include: { employee: true },
    });
    const pos = await prisma.position.findUniqueOrThrow({
      where: { code: "PHA_CHE" },
    });

    baristaPositionId = pos.id;
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
  });

  it("loads the 3 database-configured default shift templates (Morning, Afternoon, Evening) with position requirements", async () => {
    const templates = await shiftTemplateService.listShiftTemplates(
      ownerActor,
      { includeInactive: false },
    );
    expect(templates.length).toBeGreaterThanOrEqual(3);
    const codes = templates.map((t) => t.code);
    expect(codes).toContain("CA_SANG");
    expect(codes).toContain("CA_CHIEU");
    expect(codes).toContain("CA_TOI");

    const morning = templates.find((t) => t.code === "CA_SANG")!;
    expect(morning.startTime).toBe("06:00");
    expect(morning.endTime).toBe("12:00");
    expect(morning.netDurationMinutes).toBe(360);
    expect(morning.positionRequirements.length).toBeGreaterThan(0);
  });

  it("rejects invalid shift template where minStaff > maxStaff or startTime === endTime", async () => {
    await expect(
      shiftTemplateService.createShiftTemplate(ownerActor, {
        code: "CA_LOI_1",
        name: "Ca Lỗi",
        startTime: "08:00",
        endTime: "08:00",
        breakMinutes: 0,
        minStaff: 2,
        maxStaff: 4,
        priority: 1,
        isPeak: false,
        positionRequirements: [],
      }),
    ).rejects.toThrow(AppValidationError);

    await expect(
      shiftTemplateService.createShiftTemplate(ownerActor, {
        code: "CA_LOI_2",
        name: "Ca Lỗi Nhân sự",
        startTime: "08:00",
        endTime: "12:00",
        breakMinutes: 0,
        minStaff: 5,
        maxStaff: 3,
        priority: 1,
        isPeak: false,
        positionRequirements: [],
      }),
    ).rejects.toThrow(AppValidationError);
  });

  it("blocks EMPLOYEE from editing shift templates and allows OWNER to create/update an overnight shift template", async () => {
    const suffix = Date.now().toString().slice(-5);

    await expect(
      shiftTemplateService.createShiftTemplate(employeeActor, {
        code: `CA_DEM_${suffix}`,
        name: "Ca Đêm",
        startTime: "22:00",
        endTime: "02:00",
        breakMinutes: 15,
        minStaff: 2,
        maxStaff: 3,
        priority: 2,
        isPeak: false,
        positionRequirements: [],
      }),
    ).rejects.toThrow(AppForbiddenError);

    const created = await shiftTemplateService.createShiftTemplate(ownerActor, {
      code: `CA_DEM_${suffix}`,
      name: `Ca Đêm Kiểm kê ${suffix}`,
      startTime: "22:00",
      endTime: "02:00",
      breakMinutes: 15,
      minStaff: 2,
      maxStaff: 3,
      priority: 2,
      isPeak: false,
      positionRequirements: [
        { positionId: baristaPositionId, minCount: 1, maxCount: 2 },
      ],
    });

    expect(created.netDurationMinutes).toBe(225);
    expect(created.positionRequirements).toHaveLength(1);

    const updated = await shiftTemplateService.updateShiftTemplate(
      ownerActor,
      created.id,
      {
        startTime: "21:30",
        endTime: "01:30",
        isActive: false,
      },
    );
    expect(updated.isActive).toBe(false);
    expect(updated.netDurationMinutes).toBe(225);

    await prisma.shiftTemplate.delete({ where: { id: created.id } });
  });
});

