import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { validatePasswordStrength } from "@/modules/auth/credentials.service";

export interface GoLiveOwnerBootstrapInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  employeeCode?: string;
  hourlyRate?: number;
}

export interface GoLiveResetOptions {
  dryRun: boolean;
  confirm: boolean;
  skipBackup?: boolean;
  backupDir?: string;
  owner?: GoLiveOwnerBootstrapInput;
}

export interface GoLiveResetCounts {
  attendanceEvents: number;
  attendanceAdjustmentRequests: number;
  attendances: number;
  attendanceSessions: number;
  kioskSessions: number;
  shiftHandovers: number;
  swapRequests: number;
  leaveRequests: number;
  availabilities: number;
  shiftAssignments: number;
  shiftPositionRequirements: number;
  shifts: number;
  scheduleRevisions: number;
  schedules: number;
  payrollItems: number;
  payrollPeriods: number;
  notifications: number;
  auditLogs: number;
  employeeSessions: number;
  payRates: number;
  employmentHistories: number;
  employeeSkills: number;
  employees: number;
  users: number;
}

export interface GoLivePreservedSummary {
  systemSettingKeys: string[];
  shiftTemplateCodes: string[];
  positionCodes: string[];
}

export interface GoLiveResetReport {
  mode: "DRY_RUN" | "EXECUTED";
  backupFilePath: string | null;
  wouldDeleteOrDeleted: GoLiveResetCounts;
  preserved: GoLivePreservedSummary;
  bootstrappedOwner: {
    email: string;
    fullName: string;
    employeeCode: string;
  } | null;
}

export function parseGoLiveResetArgs(argv: string[]): GoLiveResetOptions {
  let dryRun = false;
  let confirm = false;
  let skipBackup = false;
  let backupDir: string | undefined;

  let ownerEmail: string | undefined;
  let ownerPassword: string | undefined;
  let ownerName: string | undefined;
  let ownerPhone: string | undefined;
  let ownerCode: string | undefined;
  let ownerHourlyRate: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--confirm") {
      confirm = true;
    } else if (arg === "--skip-backup") {
      skipBackup = true;
    } else if (arg === "--backup-dir" && argv[i + 1]) {
      backupDir = argv[++i];
    } else if (arg === "--owner-email" && argv[i + 1]) {
      ownerEmail = argv[++i]?.trim().toLowerCase();
    } else if (arg === "--owner-password" && argv[i + 1]) {
      ownerPassword = argv[++i];
    } else if (arg === "--owner-name" && argv[i + 1]) {
      ownerName = argv[++i]?.trim();
    } else if (arg === "--owner-phone" && argv[i + 1]) {
      ownerPhone = argv[++i]?.trim();
    } else if (arg === "--owner-code" && argv[i + 1]) {
      ownerCode = argv[++i]?.trim().toUpperCase();
    } else if (arg === "--owner-rate" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isInteger(parsed) && parsed >= 1000) {
        ownerHourlyRate = parsed;
      }
    }
  }

  let owner: GoLiveOwnerBootstrapInput | undefined;
  if (ownerEmail || ownerPassword || ownerName || ownerPhone) {
    if (!ownerEmail || !ownerPassword || !ownerName || !ownerPhone) {
      throw new Error(
        "Để khởi tạo tài khoản Chủ quán thật, cần cung cấp đủ: --owner-email, --owner-password, --owner-name và --owner-phone",
      );
    }
    owner = {
      email: ownerEmail,
      password: ownerPassword,
      fullName: ownerName,
      phone: ownerPhone,
      employeeCode: ownerCode || "NV001",
      hourlyRate: ownerHourlyRate ?? 45000,
    };
  }

  return {
    dryRun,
    confirm,
    skipBackup,
    backupDir,
    owner,
  };
}

export async function collectGoLiveResetPreview(db: PrismaClient): Promise<{
  counts: GoLiveResetCounts;
  preserved: GoLivePreservedSummary;
}> {
  const [
    attendanceEvents,
    attendanceAdjustmentRequests,
    attendances,
    attendanceSessions,
    kioskSessions,
    shiftHandovers,
    swapRequests,
    leaveRequests,
    availabilities,
    shiftAssignments,
    shiftPositionRequirements,
    shifts,
    scheduleRevisions,
    schedules,
    payrollItems,
    payrollPeriods,
    notifications,
    auditLogs,
    employeeSessions,
    payRates,
    employmentHistories,
    employeeSkills,
    employees,
    users,
    settings,
    templates,
    positions,
  ] = await Promise.all([
    db.attendanceEvent.count(),
    db.attendanceAdjustmentRequest.count(),
    db.attendance.count(),
    db.attendanceSession.count(),
    db.kioskSession.count(),
    db.shiftHandover.count(),
    db.swapRequest.count(),
    db.leaveRequest.count(),
    db.availability.count(),
    db.shiftAssignment.count(),
    db.shiftPositionRequirement.count(),
    db.shift.count(),
    db.scheduleRevision.count(),
    db.schedule.count(),
    db.payrollItem.count(),
    db.payrollPeriod.count(),
    db.notification.count(),
    db.auditLog.count(),
    db.employeeSession.count(),
    db.payRate.count(),
    db.employmentHistory.count(),
    db.employeeSkill.count(),
    db.employee.count(),
    db.user.count(),
    db.systemSetting.findMany({ select: { key: true }, orderBy: { key: "asc" } }),
    db.shiftTemplate.findMany({
      where: { isActive: true },
      select: { code: true },
      orderBy: { code: "asc" },
    }),
    db.position.findMany({
      where: { isActive: true },
      select: { code: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return {
    counts: {
      attendanceEvents,
      attendanceAdjustmentRequests,
      attendances,
      attendanceSessions,
      kioskSessions,
      shiftHandovers,
      swapRequests,
      leaveRequests,
      availabilities,
      shiftAssignments,
      shiftPositionRequirements,
      shifts,
      scheduleRevisions,
      schedules,
      payrollItems,
      payrollPeriods,
      notifications,
      auditLogs,
      employeeSessions,
      payRates,
      employmentHistories,
      employeeSkills,
      employees,
      users,
    },
    preserved: {
      systemSettingKeys: settings.map((s) => s.key),
      shiftTemplateCodes: templates.map((t) => t.code),
      positionCodes: positions.map((p) => p.code),
    },
  };
}

export async function createPreResetJsonBackup(
  db: PrismaClient,
  backupDir: string,
): Promise<string> {
  await mkdir(backupDir, { recursive: true });
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const filePath = path.join(backupDir, `go-live-pre-reset-${timestamp}.json`);

  const [settings, positions, templates, users, employees] = await Promise.all([
    db.systemSetting.findMany(),
    db.position.findMany(),
    db.shiftTemplate.findMany({ include: { positionRequirements: true } }),
    db.user.findMany({
      select: { id: true, email: true, role: true, isActive: true, createdAt: true },
    }),
    db.employee.findMany({
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        primaryPositionId: true,
      },
    }),
  ]);

  const snapshot = {
    exportedAt: new Date().toISOString(),
    note: "Pre-reset snapshot created automatically before go-live-reset",
    systemSettings: settings,
    positions,
    shiftTemplates: templates,
    users,
    employees,
  };

  await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
  return filePath;
}

export async function executeGoLiveReset(
  db: PrismaClient,
  options: GoLiveResetOptions,
): Promise<GoLiveResetReport> {
  if (!options.dryRun && !options.confirm) {
    throw new Error(
      "Thao tác go-live-reset bị chặn để bảo vệ dữ liệu. Vui lòng chạy với --dry-run để xem trước, hoặc truyền --confirm để thực thi.",
    );
  }

  if (options.owner) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.owner.email)) {
      throw new Error("Email Chủ quán không đúng định dạng");
    }
    const cleanPhone = options.owner.phone.replace(/\D/g, "");
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      throw new Error("Số điện thoại Chủ quán không hợp lệ (cần 8–15 chữ số)");
    }
    const pwCheck = validatePasswordStrength(options.owner.password);
    if (!pwCheck.valid) {
      throw new Error(
        `Mật khẩu Chủ quán không đạt yêu cầu bảo mật: ${pwCheck.message}`,
      );
    }
  }

  const { counts, preserved } = await collectGoLiveResetPreview(db);

  if (options.dryRun) {
    return {
      mode: "DRY_RUN",
      backupFilePath: null,
      wouldDeleteOrDeleted: counts,
      preserved,
      bootstrappedOwner: options.owner
        ? {
            email: options.owner.email,
            fullName: options.owner.fullName,
            employeeCode: options.owner.employeeCode ?? "NV001",
          }
        : null,
    };
  }

  let backupFilePath: string | null = null;
  if (!options.skipBackup) {
    const targetBackupDir =
      options.backupDir ?? path.resolve(process.cwd(), "backups");
    backupFilePath = await createPreResetJsonBackup(db, targetBackupDir);
  }

  const ownerPasswordHash = options.owner
    ? await bcrypt.hash(options.owner.password, 10)
    : null;

  let bootstrappedOwner: GoLiveResetReport["bootstrappedOwner"] = null;

  await db.$transaction(async (tx) => {
    // 1. Delete operational/demo records in strict FK-safe order
    await tx.attendanceEvent.deleteMany();
    await tx.attendanceAdjustmentRequest.deleteMany();
    await tx.attendance.deleteMany();
    await tx.attendanceSession.deleteMany();
    await tx.kioskSession.deleteMany();
    await tx.shiftHandover.deleteMany();
    await tx.swapRequest.deleteMany();
    await tx.leaveRequest.deleteMany();
    await tx.availability.deleteMany();
    await tx.shiftAssignment.deleteMany();
    await tx.shiftPositionRequirement.deleteMany();
    await tx.shift.deleteMany();
    await tx.scheduleRevision.deleteMany();
    await tx.schedule.deleteMany();
    await tx.payrollItem.deleteMany();
    await tx.payrollPeriod.deleteMany();
    await tx.notification.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.employeeSession.deleteMany();
    await tx.payRate.deleteMany();
    await tx.employmentHistory.deleteMany();
    await tx.employeeSkill.deleteMany();
    await tx.employee.deleteMany();

    // Detach SystemSetting.updatedById before deleting users so SystemSetting stays 100% intact
    await tx.systemSetting.updateMany({
      data: { updatedById: null },
    });
    await tx.user.deleteMany();

    // 2. Optionally bootstrap the real OWNER account
    if (options.owner && ownerPasswordHash) {
      const ownerPosition =
        (await tx.position.findFirst({
          where: { code: "QUAN_LY", isActive: true },
        })) ??
        (await tx.position.findFirst({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        }));

      if (!ownerPosition) {
        throw new Error(
          "Không tìm thấy vị trí công việc (Position) nào đang hoạt động để gán cho tài khoản Chủ quán.",
        );
      }

      const ownerUser = await tx.user.create({
        data: {
          email: options.owner.email,
          passwordHash: ownerPasswordHash,
          role: "OWNER",
          isActive: true,
        },
      });

      const empCode = options.owner.employeeCode ?? "NV001";
      const hireDate = new Date();

      const ownerEmployee = await tx.employee.create({
        data: {
          userId: ownerUser.id,
          employeeCode: empCode,
          fullName: options.owner.fullName,
          phone: options.owner.phone,
          email: options.owner.email,
          hireDate,
          status: "ACTIVE",
          primaryPositionId: ownerPosition.id,
          weeklyTargetHours: 36,
          maxWeeklyHours: 48,
          internalNotes: "Tài khoản Chủ quán khởi tạo qua go-live-reset",
        },
      });

      await tx.employeeSkill.create({
        data: {
          employeeId: ownerEmployee.id,
          positionId: ownerPosition.id,
          proficiency: "ADVANCED",
        },
      });

      await tx.payRate.create({
        data: {
          employeeId: ownerEmployee.id,
          hourlyRate: BigInt(options.owner.hourlyRate ?? 45000),
          effectiveFrom: hireDate,
          note: "Khởi tạo khi Go-Live",
          createdById: ownerUser.id,
        },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId: ownerEmployee.id,
          eventType: "HIRED",
          effectiveDate: hireDate,
          summary: `Khởi tạo tài khoản Chủ quán khi Go-Live (${ownerPosition.name})`,
          details: {
            employeeCode: empCode,
            role: "OWNER",
            source: "GO_LIVE_RESET",
          },
          recordedById: ownerUser.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: ownerUser.id,
          action: "GO_LIVE_RESET_COMPLETED",
          entityType: "System",
          entityId: "go-live-reset",
          newValues: {
            backupFilePath,
            preservedSettings: preserved.systemSettingKeys,
            preservedTemplates: preserved.shiftTemplateCodes,
          },
        },
      });

      bootstrappedOwner = {
        email: ownerUser.email,
        fullName: ownerEmployee.fullName,
        employeeCode: ownerEmployee.employeeCode,
      };
    }
  });

  return {
    mode: "EXECUTED",
    backupFilePath,
    wouldDeleteOrDeleted: counts,
    preserved,
    bootstrappedOwner,
  };
}
