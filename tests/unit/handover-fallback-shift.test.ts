import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppValidationError } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";

const mockShiftTemplateFindFirst = vi.fn();
const mockShiftFindFirst = vi.fn();
const mockShiftFindUnique = vi.fn();
const mockShiftCreate = vi.fn();
const mockScheduleFindUnique = vi.fn();
const mockScheduleCreate = vi.fn();
const mockShiftHandoverFindFirst = vi.fn();
const mockShiftHandoverCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shiftTemplate: {
      findFirst: (...args: unknown[]) => mockShiftTemplateFindFirst(...args),
    },
    shift: {
      findFirst: (...args: unknown[]) => mockShiftFindFirst(...args),
      findUnique: (...args: unknown[]) => mockShiftFindUnique(...args),
      create: (...args: unknown[]) => mockShiftCreate(...args),
    },
    schedule: {
      findUnique: (...args: unknown[]) => mockScheduleFindUnique(...args),
      create: (...args: unknown[]) => mockScheduleCreate(...args),
    },
    shiftHandover: {
      findFirst: (...args: unknown[]) => mockShiftHandoverFindFirst(...args),
      create: (...args: unknown[]) => mockShiftHandoverCreate(...args),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { handoverService } from "@/modules/handover/handover.service";
import { validateHandoverSubmission } from "@/modules/handover/handover-calculator";

const actor: SessionUser = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "khoi@dlat.cafe",
  role: "EMPLOYEE",
  employeeId: "22222222-2222-2222-2222-222222222222",
  fullName: "Nguyễn Minh Khôi",
};

const baseInput = {
  handoverEmployeeId: "22222222-2222-2222-2222-222222222222",
  reconciliation: {
    openingCashVnd: 1000000n,
    cashSalesVnd: 500000n,
    cashExpensesVnd: 0n,
    actualClosingCashVnd: 1500000n,
  },
  inventory: [
    {
      code: "CF_HAT",
      name: "Cà phê hạt",
      unit: "kg",
      status: "SUFFICIENT" as const,
    },
  ],
  equipment: [
    {
      code: "ESP",
      name: "Máy pha",
      condition: "GOOD" as const,
    },
  ],
  cleanliness: [],
};

describe("handoverService.submitHandover shift resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-UUID shiftId that is not shift-today-fallback with AppValidationError", async () => {
    await expect(
      handoverService.submitHandover(
        { ...baseInput, shiftId: "invalid-shift-id" },
        actor,
      ),
    ).rejects.toBeInstanceOf(AppValidationError);

    expect(mockShiftFindUnique).not.toHaveBeenCalled();
  });

  it("creates a real Schedule + Shift when shiftId is shift-today-fallback and no shift exists", async () => {
    const createdShiftId = "33333333-3333-3333-3333-333333333333";
    mockShiftTemplateFindFirst.mockResolvedValue({
      id: "44444444-4444-4444-4444-444444444444",
      code: "CA_1",
      name: "Ca 1 (07:00–11:00)",
      startTime: "07:00",
      endTime: "11:00",
      minStaff: 1,
      maxStaff: 2,
    });
    mockShiftFindFirst.mockResolvedValue(null);
    mockScheduleFindUnique.mockResolvedValue(null);
    mockScheduleCreate.mockResolvedValue({
      id: "55555555-5555-5555-5555-555555555555",
    });
    mockShiftCreate.mockResolvedValue({
      id: createdShiftId,
      assignments: [],
    });
    mockShiftHandoverFindFirst.mockResolvedValue(null);
    mockShiftHandoverCreate.mockResolvedValue({
      id: "66666666-6666-6666-6666-666666666666",
      shiftId: createdShiftId,
      status: "SUBMITTED",
      cashDifferenceVnd: 0n,
    });

    const result = await handoverService.submitHandover(
      {
        ...baseInput,
        shiftId: "shift-today-fallback",
        fallbackShift: { workDate: "2026-11-16", templateCode: "CA_1" },
      },
      actor,
    );

    expect(mockShiftFindUnique).not.toHaveBeenCalled();
    expect(mockScheduleCreate).toHaveBeenCalledTimes(1);
    expect(mockShiftCreate).toHaveBeenCalledTimes(1);
    expect(mockShiftHandoverCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shift: { connect: { id: createdShiftId } },
        }),
      }),
    );
    expect(result.shiftId).toBe(createdShiftId);
  });

  it("rejects incomplete due-today checklist item without >=3 char reason note on backend", () => {
    const res = validateHandoverSubmission({
      ...baseInput,
      shiftId: "shift-today-fallback",
      cleanliness: [
        {
          area: "[8] Lau kính",
          isDone: false,
          isDueToday: true,
          note: "ok",
        },
      ],
    });
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain("[8] Lau kính");
  });

  it("allows incomplete non-due checklist item without note on backend", () => {
    const res = validateHandoverSubmission({
      ...baseInput,
      shiftId: "shift-today-fallback",
      cleanliness: [
        {
          area: "[9] Lau lá cây",
          isDone: false,
          isDueToday: false,
          note: "",
        },
      ],
    });
    expect(res.isValid).toBe(true);
  });
});

