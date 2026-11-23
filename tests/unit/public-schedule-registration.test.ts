import { describe, it, expect } from "vitest";
import {
  validateEmployeePin,
  isRegistrationOpen,
  validateRegistrationPayload,
  getDefaultRegistrationDeadline,
} from "../../src/modules/availability/public-registration.service";

describe("Public Schedule Registration Logic", () => {
  it("TC_REG_01: validates PIN correctly with 4 last digits of phone number", () => {
    // Normal phone
    expect(validateEmployeePin("0912444555", "4555")).toBe(true);
    // Formatted phone with dots or spaces
    expect(validateEmployeePin("0912.444.555", "4555")).toBe(true);
    expect(validateEmployeePin("0912 333 444", "3444")).toBe(true);
    // Wrong PIN
    expect(validateEmployeePin("0912444555", "1234")).toBe(false);
    expect(validateEmployeePin("0912444555", "555")).toBe(false); // < 4 digits
    expect(validateEmployeePin("", "4555")).toBe(false);
  });

  it("TC_REG_02: checks deadline expiration accurately", () => {
    const futureDeadline = new Date(Date.now() + 24 * 60 * 60_000);
    const pastDeadline = new Date(Date.now() - 60_000);

    expect(isRegistrationOpen(null)).toBe(true);
    expect(isRegistrationOpen(futureDeadline)).toBe(true);
    expect(isRegistrationOpen(pastDeadline)).toBe(false);
  });

  it("TC_REG_03: validates registration payload properly", () => {
    const valid = validateRegistrationPayload({
      employeeId: "emp-123",
      pinCode: "4555",
      weekStart: "2026-11-17",
      slots: [
        { workDate: "2026-11-17", templateId: "tmpl-1", preference: "AVAILABLE" },
        { workDate: "2026-11-17", templateId: "tmpl-2", preference: "PREFERRED" },
      ],
      desiredShifts: 5,
    });
    expect(valid.isValid).toBe(true);

    const missingEmp = validateRegistrationPayload({
      pinCode: "4555",
      weekStart: "2026-11-17",
      slots: [{ workDate: "2026-11-17", templateId: "tmpl-1", preference: "AVAILABLE" }],
    });
    expect(missingEmp.isValid).toBe(false);
    expect(missingEmp.error).toContain("nhân viên");

    const shortPin = validateRegistrationPayload({
      employeeId: "emp-123",
      pinCode: "12",
      weekStart: "2026-11-17",
      slots: [{ workDate: "2026-11-17", templateId: "tmpl-1", preference: "AVAILABLE" }],
    });
    expect(shortPin.isValid).toBe(false);
    expect(shortPin.error).toContain("4 chữ số");
  });

  it("TC_REG_04: sets default registration deadline to Saturday 19:00 VN before Monday weekStart", () => {
    const deadline = getDefaultRegistrationDeadline("2026-11-23");
    // 2026-11-21 19:00:00+07:00 == 2026-11-21T12:00:00.000Z
    expect(deadline.toISOString()).toBe("2026-11-21T12:00:00.000Z");
    expect(isRegistrationOpen(deadline, new Date("2026-11-21T11:59:59.000Z"))).toBe(true);
    expect(isRegistrationOpen(deadline, new Date("2026-11-21T12:00:01.000Z"))).toBe(false);
  });
});
