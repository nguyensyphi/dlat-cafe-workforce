import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, type SessionUser } from "@/lib/auth";
import { parseDateOnlyUtc, todayDateStringVN } from "@/lib/date";
import { AppValidationError, assertPermission } from "@/lib/permissions";
import { recordAuditLog } from "@/modules/audit/audit.service";
import { validatePinFormat } from "@/modules/auth/credentials.service";

export const EMPLOYEE_CSV_HEADERS = [
  "ma_nv",
  "ho_ten",
  "email",
  "so_dien_thoai",
  "chuc_vu_chinh",
  "luong_gio",
  "gio_muc_tieu_tuan",
  "gio_toi_da_tuan",
  "ngay_vao_lam",
  "vai_tro",
  "mat_khau",
  "ma_pin",
  "ghi_chu",
] as const;

export interface ParsedEmployeeCsvRow {
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  normalizedPhone: string;
  primaryPositionInput: string;
  primaryPositionId: string | null;
  primaryPositionName: string | null;
  hourlyRate: number;
  weeklyTargetHours: number;
  maxWeeklyHours: number;
  hireDate: string;
  role: UserRole;
  password: string;
  pin: string | null;
  internalNotes: string | null;
}

export interface EmployeeCsvPreviewRow {
  rowNumber: number;
  status: "VALID" | "ERROR";
  errors: string[];
  data: ParsedEmployeeCsvRow;
}

export interface EmployeeCsvPreviewResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: EmployeeCsvPreviewRow[];
}

export interface EmployeeCsvCommitResult {
  createdCount: number;
  skippedCount: number;
  createdEmployees: Array<{
    id: string;
    employeeCode: string;
    fullName: string;
    email: string;
  }>;
  errors: Array<{
    rowNumber: number;
    employeeCode: string;
    errors: string[];
  }>;
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function normalizeHeaderKey(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const HEADER_ALIASES: Record<string, (typeof EMPLOYEE_CSV_HEADERS)[number]> = {
  ma_nv: "ma_nv",
  manv: "ma_nv",
  employee_code: "ma_nv",
  code: "ma_nv",
  ma_nhan_vien: "ma_nv",
  ho_ten: "ho_ten",
  ho_va_ten: "ho_ten",
  full_name: "ho_ten",
  fullname: "ho_ten",
  ten: "ho_ten",
  email: "email",
  thu_dien_tu: "email",
  so_dien_thoai: "so_dien_thoai",
  sdt: "so_dien_thoai",
  dien_thoai: "so_dien_thoai",
  phone: "so_dien_thoai",
  chuc_vu_chinh: "chuc_vu_chinh",
  chuc_vu: "chuc_vu_chinh",
  vi_tri: "chuc_vu_chinh",
  vi_tri_chinh: "chuc_vu_chinh",
  position: "chuc_vu_chinh",
  primary_position: "chuc_vu_chinh",
  luong_gio: "luong_gio",
  don_gia_gio: "luong_gio",
  hourly_rate: "luong_gio",
  luong: "luong_gio",
  gio_muc_tieu_tuan: "gio_muc_tieu_tuan",
  gio_muc_tieu: "gio_muc_tieu_tuan",
  weekly_target_hours: "gio_muc_tieu_tuan",
  gio_toi_da_tuan: "gio_toi_da_tuan",
  gio_toi_da: "gio_toi_da_tuan",
  max_weekly_hours: "gio_toi_da_tuan",
  ngay_vao_lam: "ngay_vao_lam",
  hire_date: "ngay_vao_lam",
  vai_tro: "vai_tro",
  role: "vai_tro",
  mat_khau: "mat_khau",
  password: "mat_khau",
  ma_pin: "ma_pin",
  pin: "ma_pin",
  ghi_chu: "ghi_chu",
  notes: "ghi_chu",
  internal_notes: "ghi_chu",
};

/**
 * RFC-4180 compliant CSV parser supporting UTF-8 BOM, quoted values,
 * embedded commas/newlines, and escaped double quotes.
 */
export function parseCsvText(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      currentRow.push(currentField);
      currentField = "";
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") {
        i += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
    } else if (ch === "\n") {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

export function generateEmployeeCsvTemplate(): string {
  const header = EMPLOYEE_CSV_HEADERS.join(",");
  const today = todayDateStringVN();
  const sampleRows = [
    [
      "NV101",
      "Nguyễn Văn An",
      "an.nguyen@dlatcafe.vn",
      "0905123456",
      "PHA_CHE",
      "28000",
      "30",
      "48",
      today,
      "EMPLOYEE",
      "Dlat@2026",
      "3456",
      "Barista ca sáng",
    ],
    [
      "NV102",
      "Trần Thị Bình",
      "binh.tran@dlatcafe.vn",
      "0905654321",
      "PHUC_VU",
      "25000",
      "24",
      "42",
      today,
      "EMPLOYEE",
      "Dlat@2026",
      "",
      "Phục vụ linh hoạt cuối tuần",
    ],
  ];
  const body = sampleRows.map((row) => row.join(",")).join("\r\n");
  return `\uFEFF${header}\r\n${body}\r\n`;
}

function normalizeLookupText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function parseRole(raw: string): UserRole | null {
  const norm = normalizeLookupText(raw);
  if (!norm || norm === "employee" || norm === "nhan vien" || norm === "nv") {
    return "EMPLOYEE";
  }
  if (norm === "manager" || norm === "quan ly") {
    return "MANAGER";
  }
  if (norm === "owner" || norm === "chu quan") {
    return "OWNER";
  }
  return null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CODE_REGEX = /^[A-Z0-9_-]{2,32}$/;

async function validateCsvAgainstDb(
  csvText: string,
): Promise<EmployeeCsvPreviewResult> {
  if (!csvText || !csvText.trim()) {
    throw new AppValidationError("Nội dung file CSV trống");
  }

  const rawRows = parseCsvText(csvText);
  if (rawRows.length < 2) {
    throw new AppValidationError(
      "File CSV phải gồm dòng tiêu đề và ít nhất 1 dòng dữ liệu nhân viên",
    );
  }

  const headerCells = rawRows[0]!;
  const columnMap = new Map<(typeof EMPLOYEE_CSV_HEADERS)[number], number>();
  headerCells.forEach((cell, idx) => {
    const canonical = HEADER_ALIASES[normalizeHeaderKey(cell)];
    if (canonical && !columnMap.has(canonical)) {
      columnMap.set(canonical, idx);
    }
  });

  const requiredCols: Array<(typeof EMPLOYEE_CSV_HEADERS)[number]> = [
    "ma_nv",
    "ho_ten",
    "email",
    "so_dien_thoai",
    "chuc_vu_chinh",
    "luong_gio",
  ];
  const missingCols = requiredCols.filter((c) => !columnMap.has(c));
  if (missingCols.length > 0) {
    throw new AppValidationError(
      `Thiếu cột bắt buộc trong file CSV: ${missingCols.join(", ")}. Hãy tải file CSV mẫu chuẩn.`,
    );
  }

  const [positions, existingEmployees, existingUsers] = await Promise.all([
    prisma.position.findMany({ where: { isActive: true } }),
    prisma.employee.findMany({
      select: { employeeCode: true, email: true, phone: true },
    }),
    prisma.user.findMany({ select: { email: true } }),
  ]);

  const positionByLookup = new Map<string, { id: string; name: string }>();
  for (const pos of positions) {
    positionByLookup.set(pos.code.toUpperCase(), { id: pos.id, name: pos.name });
    positionByLookup.set(normalizeLookupText(pos.name), {
      id: pos.id,
      name: pos.name,
    });
  }

  const dbCodes = new Set(
    existingEmployees.map((e) => e.employeeCode.toUpperCase()),
  );
  const dbEmails = new Set([
    ...existingEmployees.map((e) => e.email.toLowerCase()),
    ...existingUsers.map((u) => u.email.toLowerCase()),
  ]);
  const dbPhones = new Set(
    existingEmployees
      .map((e) => normalizePhoneDigits(e.phone))
      .filter((p) => p.length > 0),
  );

  const seenCodes = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const seenPhones = new Map<string, number>();

  const defaultHireDate = todayDateStringVN();
  const previewRows: EmployeeCsvPreviewRow[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const rowNumber = i + 1;
    const cells = rawRows[i]!;
    const getCell = (col: (typeof EMPLOYEE_CSV_HEADERS)[number]): string => {
      const idx = columnMap.get(col);
      if (idx === undefined) return "";
      return (cells[idx] ?? "").trim();
    };

    const errors: string[] = [];

    const employeeCode = getCell("ma_nv").toUpperCase();
    const fullName = getCell("ho_ten");
    const email = getCell("email").toLowerCase();
    const phone = getCell("so_dien_thoai");
    const normalizedPhone = normalizePhoneDigits(phone);
    const primaryPositionInput = getCell("chuc_vu_chinh");
    const rawHourlyRate = getCell("luong_gio").replace(/[.,\s₫]/g, "");
    const rawTarget = getCell("gio_muc_tieu_tuan");
    const rawMax = getCell("gio_toi_da_tuan");
    const rawHireDate = getCell("ngay_vao_lam");
    const rawRole = getCell("vai_tro");
    const rawPassword = getCell("mat_khau");
    const rawPin = getCell("ma_pin");
    const internalNotes = getCell("ghi_chu") || null;

    // 1. Validate employeeCode
    if (!employeeCode) {
      errors.push("Thiếu mã nhân viên (ma_nv)");
    } else if (!CODE_REGEX.test(employeeCode)) {
      errors.push(
        "Mã nhân viên không hợp lệ (2–32 ký tự chữ không dấu, số, _ hoặc -)",
      );
    } else {
      if (dbCodes.has(employeeCode)) {
        errors.push(`Trùng mã nhân viên '${employeeCode}' đã có trong hệ thống`);
      }
      const prevRow = seenCodes.get(employeeCode);
      if (prevRow !== undefined) {
        errors.push(
          `Trùng mã nhân viên '${employeeCode}' với dòng ${prevRow} trong file CSV`,
        );
      } else {
        seenCodes.set(employeeCode, rowNumber);
      }
    }

    // 2. Validate fullName
    if (fullName.length < 2 || fullName.length > 150) {
      errors.push("Họ và tên phải từ 2 đến 150 ký tự");
    }

    // 3. Validate email
    if (!email || !EMAIL_REGEX.test(email)) {
      errors.push("Email sai định dạng");
    } else {
      if (dbEmails.has(email)) {
        errors.push(`Email '${email}' đã tồn tại trong hệ thống`);
      }
      const prevRow = seenEmails.get(email);
      if (prevRow !== undefined) {
        errors.push(`Trùng email '${email}' với dòng ${prevRow} trong file CSV`);
      } else {
        seenEmails.set(email, rowNumber);
      }
    }

    // 4. Validate phone
    if (normalizedPhone.length < 8 || normalizedPhone.length > 15) {
      errors.push("Số điện thoại sai định dạng (cần 8–15 chữ số)");
    } else {
      if (dbPhones.has(normalizedPhone)) {
        errors.push(`Trùng SĐT '${phone}' đã tồn tại trong hệ thống`);
      }
      const prevRow = seenPhones.get(normalizedPhone);
      if (prevRow !== undefined) {
        errors.push(`Trùng SĐT '${phone}' với dòng ${prevRow} trong file CSV`);
      } else {
        seenPhones.set(normalizedPhone, rowNumber);
      }
    }

    // 5. Validate position
    const matchedPos =
      positionByLookup.get(primaryPositionInput.toUpperCase()) ??
      positionByLookup.get(normalizeLookupText(primaryPositionInput)) ??
      null;
    if (!primaryPositionInput || !matchedPos) {
      errors.push(
        `Chức vụ '${primaryPositionInput || "(trống)"}' không tồn tại trong hệ thống`,
      );
    }

    // 6. Validate hourlyRate
    const hourlyRate = Number(rawHourlyRate);
    if (
      !rawHourlyRate ||
      !Number.isInteger(hourlyRate) ||
      hourlyRate < 1000 ||
      hourlyRate > 5_000_000
    ) {
      errors.push("Lương giờ phải là số nguyên từ 1.000 đến 5.000.000 VND");
    }

    // 7. Weekly hours
    const weeklyTargetHours = rawTarget ? Number(rawTarget) : 24;
    const maxWeeklyHours = rawMax ? Number(rawMax) : 48;
    if (
      !Number.isFinite(weeklyTargetHours) ||
      weeklyTargetHours < 0 ||
      weeklyTargetHours > 84
    ) {
      errors.push("Giờ mục tiêu tuần phải từ 0 đến 84");
    }
    if (
      !Number.isFinite(maxWeeklyHours) ||
      maxWeeklyHours < 1 ||
      maxWeeklyHours > 84
    ) {
      errors.push("Giờ tối đa tuần phải từ 1 đến 84");
    }
    if (
      Number.isFinite(weeklyTargetHours) &&
      Number.isFinite(maxWeeklyHours) &&
      weeklyTargetHours > maxWeeklyHours
    ) {
      errors.push("Giờ mục tiêu tuần không được vượt quá giờ tối đa tuần");
    }

    // 8. Hire date (strict calendar date check — rejects overflow like 2026-02-31)
    const hireDate = rawHireDate || defaultHireDate;
    const parsedHireDate = DATE_REGEX.test(hireDate)
      ? new Date(`${hireDate}T00:00:00.000Z`)
      : null;
    if (
      !parsedHireDate ||
      Number.isNaN(parsedHireDate.getTime()) ||
      parsedHireDate.toISOString().slice(0, 10) !== hireDate
    ) {
      errors.push("Ngày vào làm phải đúng định dạng YYYY-MM-DD và là ngày hợp lệ");
    }

    // 9. Role
    const role = parseRole(rawRole);
    if (!role) {
      errors.push(
        `Vai trò '${rawRole}' không hợp lệ (chỉ nhận EMPLOYEE, MANAGER hoặc OWNER)`,
      );
    }

    // 10. Password (default to Dlat@<last4phone> if left blank)
    const fallbackPassword = `Dlat@${normalizedPhone.slice(-4) || "2026"}`;
    const password = rawPassword || fallbackPassword;
    if (password.length < 6 || password.length > 100) {
      errors.push("Mật khẩu phải từ 6 đến 100 ký tự");
    }

    // 11. Optional custom PIN
    let pin: string | null = null;
    if (rawPin) {
      const pinCheck = validatePinFormat(rawPin);
      if (!pinCheck.valid) {
        errors.push(pinCheck.message ?? "Mã PIN không hợp lệ");
      } else {
        pin = rawPin;
      }
    }

    previewRows.push({
      rowNumber,
      status: errors.length === 0 ? "VALID" : "ERROR",
      errors,
      data: {
        employeeCode,
        fullName,
        email,
        phone,
        normalizedPhone,
        primaryPositionInput,
        primaryPositionId: matchedPos?.id ?? null,
        primaryPositionName: matchedPos?.name ?? null,
        hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
        weeklyTargetHours: Number.isFinite(weeklyTargetHours)
          ? weeklyTargetHours
          : 24,
        maxWeeklyHours: Number.isFinite(maxWeeklyHours) ? maxWeeklyHours : 48,
        hireDate,
        role: role ?? "EMPLOYEE",
        password,
        pin,
        internalNotes,
      },
    });
  }

  const validCount = previewRows.filter((r) => r.status === "VALID").length;
  const errorCount = previewRows.length - validCount;

  return {
    totalRows: previewRows.length,
    validCount,
    errorCount,
    rows: previewRows,
  };
}

export const employeeCsvService = {
  generateTemplate(): string {
    return generateEmployeeCsvTemplate();
  },

  async previewImport(
    actor: SessionUser,
    csvText: string,
  ): Promise<EmployeeCsvPreviewResult> {
    assertPermission(actor.role, "employees:write");
    return validateCsvAgainstDb(csvText);
  },

  async commitImport(
    actor: SessionUser,
    csvText: string,
    options?: { skipInvalid?: boolean },
  ): Promise<EmployeeCsvCommitResult> {
    assertPermission(actor.role, "employees:write");
    const preview = await validateCsvAgainstDb(csvText);

    const skipInvalid = options?.skipInvalid ?? false;
    if (!skipInvalid && preview.errorCount > 0) {
      throw new AppValidationError(
        `Có ${preview.errorCount} dòng lỗi trong file CSV. Vui lòng sửa lỗi hoặc chọn bỏ qua dòng lỗi.`,
      );
    }

    const validRows = preview.rows.filter((r) => r.status === "VALID");
    if (validRows.length === 0) {
      throw new AppValidationError(
        "Không có dòng nhân viên hợp lệ nào để lưu vào hệ thống",
      );
    }

    // Pre-hash passwords & PINs outside transaction to avoid holding DB locks
    const prepared = await Promise.all(
      validRows.map(async (row) => ({
        row,
        passwordHash: await hashPassword(row.data.password),
        pinHash: row.data.pin ? await hashPassword(row.data.pin) : null,
      })),
    );

    const createdEmployees = await prisma.$transaction(async (tx) => {
      const created: Array<{
        id: string;
        employeeCode: string;
        fullName: string;
        email: string;
      }> = [];

      for (const item of prepared) {
        const d = item.row.data;
        const hireDateUtc = parseDateOnlyUtc(d.hireDate);

        const user = await tx.user.create({
          data: {
            email: d.email,
            passwordHash: item.passwordHash,
            role: d.role,
            isActive: true,
          },
        });

        const employee = await tx.employee.create({
          data: {
            userId: user.id,
            employeeCode: d.employeeCode,
            fullName: d.fullName,
            phone: d.phone,
            email: d.email,
            hireDate: hireDateUtc,
            status: "ACTIVE",
            primaryPositionId: d.primaryPositionId!,
            weeklyTargetHours: d.weeklyTargetHours,
            maxWeeklyHours: d.maxWeeklyHours,
            pinHash: item.pinHash,
            internalNotes: d.internalNotes,
          },
        });

        await tx.employeeSkill.create({
          data: {
            employeeId: employee.id,
            positionId: d.primaryPositionId!,
            proficiency: "INTERMEDIATE",
          },
        });

        await tx.payRate.create({
          data: {
            employeeId: employee.id,
            hourlyRate: BigInt(d.hourlyRate),
            effectiveFrom: hireDateUtc,
            note: "Mức lương khởi điểm từ Import CSV",
            createdById: actor.userId,
          },
        });

        await tx.employmentHistory.create({
          data: {
            employeeId: employee.id,
            eventType: "HIRED",
            effectiveDate: hireDateUtc,
            summary: `Tiếp nhận nhân viên qua Import CSV vào vị trí ${d.primaryPositionName}`,
            details: {
              employeeCode: d.employeeCode,
              role: d.role,
              hourlyRate: d.hourlyRate,
              source: "CSV_IMPORT",
            },
            recordedById: actor.userId,
          },
        });

        created.push({
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          email: employee.email,
        });
      }

      await recordAuditLog(
        {
          userId: actor.userId,
          action: "EMPLOYEES_CSV_IMPORTED",
          entityType: "Employee",
          entityId: "bulk_csv",
          newValues: {
            createdCount: created.length,
            skippedCount: preview.errorCount,
            codes: created.map((c) => c.employeeCode),
          },
        },
        tx,
      );

      return created;
    });

    return {
      createdCount: createdEmployees.length,
      skippedCount: preview.errorCount,
      createdEmployees,
      errors: preview.rows
        .filter((r) => r.status === "ERROR")
        .map((r) => ({
          rowNumber: r.rowNumber,
          employeeCode: r.data.employeeCode,
          errors: r.errors,
        })),
    };
  },
};
