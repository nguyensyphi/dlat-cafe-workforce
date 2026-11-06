import { describe, expect, it } from "vitest";
import {
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";
import {
  AppForbiddenError,
  assertPermission,
  assertSelfOrManager,
  hasPermission,
} from "@/lib/permissions";

describe("Password Hashing & Session JWT", () => {
  it("hashes passwords with bcrypt and verifies matching/non-matching inputs", async () => {
    const hash = await hashPassword("Admin@123");
    expect(hash).not.toBe("Admin@123");
    expect(await verifyPassword("Admin@123", hash)).toBe(true);
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("signs and verifies session JWT payload containing userId, email, role, employeeId", async () => {
    const token = await signSessionToken({
      userId: "11111111-1111-4111-8111-111111111111",
      email: "owner@dlatcafe.vn",
      role: "OWNER",
      employeeId: "22222222-2222-4222-8222-222222222222",
      fullName: "Nguyễn Minh Khôi",
    });

    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload?.role).toBe("OWNER");
    expect(payload?.employeeId).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("returns null when verifying a tampered or malformed JWT token", async () => {
    expect(await verifySessionToken("invalid.token.value")).toBeNull();
  });
});

describe("Role-Based Access Control (RBAC) & Horizontal Ownership Guards", () => {
  it("grants OWNER full permissions including employee creation, wage management, and payroll approval", () => {
    expect(hasPermission("OWNER", "employees:write")).toBe(true);
    expect(hasPermission("OWNER", "pay_rates:write")).toBe(true);
    expect(hasPermission("OWNER", "payroll:approve")).toBe(true);
    expect(hasPermission("OWNER", "settings:write")).toBe(true);
  });

  it("grants MANAGER operational management permissions while blocking OWNER-only actions", () => {
    expect(hasPermission("MANAGER", "employees:read")).toBe(true);
    expect(hasPermission("MANAGER", "schedules:manage")).toBe(true);
    expect(hasPermission("MANAGER", "attendance:manage")).toBe(true);
    expect(hasPermission("MANAGER", "payroll:calculate")).toBe(true);
    expect(hasPermission("MANAGER", "employees:write")).toBe(false);
    expect(hasPermission("MANAGER", "pay_rates:write")).toBe(false);
    expect(hasPermission("MANAGER", "payroll:approve")).toBe(false);
  });

  it("restricts EMPLOYEE strictly to self-service capabilities", () => {
    expect(hasPermission("EMPLOYEE", "self:profile")).toBe(true);
    expect(hasPermission("EMPLOYEE", "self:availability")).toBe(true);
    expect(hasPermission("EMPLOYEE", "self:attendance")).toBe(true);
    expect(hasPermission("EMPLOYEE", "employees:read")).toBe(false);
    expect(hasPermission("EMPLOYEE", "schedules:manage")).toBe(false);
  });

  it("throws AppForbiddenError when role lacks permission", () => {
    expect(() => assertPermission("EMPLOYEE", "employees:read")).toThrow(
      AppForbiddenError,
    );
  });

  it("prevents horizontal IDOR when EMPLOYEE attempts to read another employee's record", () => {
    const actor = {
      userId: "u-emp-1",
      email: "nam@dlatcafe.vn",
      role: "EMPLOYEE" as const,
      employeeId: "emp-1",
      fullName: "Lê Hoàng Nam",
    };

    // Accessing own record passes
    expect(() => assertSelfOrManager(actor, "emp-1")).not.toThrow();

    // Accessing colleague's record throws AppForbiddenError
    expect(() => assertSelfOrManager(actor, "emp-2")).toThrow(AppForbiddenError);

    // MANAGER accessing any employee passes
    expect(() =>
      assertSelfOrManager({ ...actor, role: "MANAGER" }, "emp-2"),
    ).not.toThrow();
  });
});

