import type { UserRole } from "@prisma/client";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class AppUnauthorizedError extends AppError {
  constructor(message = "Phiên đăng nhập không hợp lệ hoặc đã hết hạn") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class AppForbiddenError extends AppError {
  constructor(message = "Bạn không có quyền thực hiện thao tác này") {
    super(message, 403, "FORBIDDEN");
  }
}

export class AppNotFoundError extends AppError {
  constructor(message = "Không tìm thấy dữ liệu yêu cầu") {
    super(message, 404, "NOT_FOUND");
  }
}

export class AppValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

/**
 * Raised when an operation is valid but has warnings that require explicit
 * confirmation (e.g. assigning an employee who registered as unavailable).
 */
export class AppConfirmationRequiredError extends AppError {
  public readonly details: unknown;

  constructor(message: string, details: unknown) {
    super(message, 409, "CONFIRMATION_REQUIRED");
    this.details = details;
  }
}

export type Permission =
  | "dashboard:manage"
  | "employees:read"
  | "employees:write"
  | "pay_rates:read"
  | "pay_rates:write"
  | "positions:read"
  | "positions:write"
  | "shifts:read"
  | "shifts:write"
  | "schedules:read"
  | "schedules:manage"
  | "requests:review"
  | "attendance:manage"
  | "kiosk:open"
  | "payroll:calculate"
  | "payroll:approve"
  | "reports:read"
  | "audit:read"
  | "settings:read"
  | "settings:write"
  | "self:profile"
  | "self:availability"
  | "self:schedule"
  | "self:requests"
  | "self:attendance"
  | "self:payroll";

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  OWNER: new Set<Permission>([
    "dashboard:manage",
    "employees:read",
    "employees:write",
    "pay_rates:read",
    "pay_rates:write",
    "positions:read",
    "positions:write",
    "shifts:read",
    "shifts:write",
    "schedules:read",
    "schedules:manage",
    "requests:review",
    "attendance:manage",
    "kiosk:open",
    "payroll:calculate",
    "payroll:approve",
    "reports:read",
    "audit:read",
    "settings:read",
    "settings:write",
    "self:profile",
    "self:availability",
    "self:schedule",
    "self:requests",
    "self:attendance",
    "self:payroll",
  ]),
  MANAGER: new Set<Permission>([
    "dashboard:manage",
    "employees:read",
    "pay_rates:read",
    "positions:read",
    "shifts:read",
    "schedules:read",
    "schedules:manage",
    "requests:review",
    "attendance:manage",
    "kiosk:open",
    "payroll:calculate",
    "reports:read",
    "settings:read",
    "self:profile",
    "self:availability",
    "self:schedule",
    "self:requests",
    "self:attendance",
    "self:payroll",
  ]),
  EMPLOYEE: new Set<Permission>([
    "positions:read",
    "shifts:read",
    "self:profile",
    "self:availability",
    "self:schedule",
    "self:requests",
    "self:attendance",
    "self:payroll",
  ]),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function assertPermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AppForbiddenError(
      `Vai trò ${role} không được cấp quyền '${permission}'`,
    );
  }
}

export function assertSelfOrManager(
  actor: { role: UserRole; employeeId: string | null },
  targetEmployeeId: string,
): void {
  if (actor.role === "OWNER" || actor.role === "MANAGER") {
    return;
  }
  if (!actor.employeeId || actor.employeeId !== targetEmployeeId) {
    throw new AppForbiddenError(
      "Nhân viên chỉ được phép truy cập thông tin cá nhân của chính mình",
    );
  }
}

