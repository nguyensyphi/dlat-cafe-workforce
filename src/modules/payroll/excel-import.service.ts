import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  AppNotFoundError,
  AppValidationError,
  assertPermission,
} from "@/lib/permissions";
import { recordAuditLog } from "@/modules/audit/audit.service";

export interface RawExcelRow {
  "Mã NV"?: string;
  "Họ và tên"?: string;
  "Số giờ làm việc"?: number | string;
  "Phụ cấp (VNĐ)"?: number | string;
  "Thưởng (VNĐ)"?: number | string;
  "Khấu trừ/Tạm ứng (VNĐ)"?: number | string;
  "Ghi chú"?: string;
  [key: string]: unknown;
}

/**
 * Extracts a cell value using candidate key aliases, case-insensitively and whitespace-trimmed.
 */
function extractCellValue(row: Record<string, unknown>, candidateKeys: string[]): unknown {
  if (!row || typeof row !== "object") return undefined;
  const rowKeys = Object.keys(row);
  for (const candidate of candidateKeys) {
    const candNorm = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const key of rowKeys) {
      const keyNorm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (keyNorm === candNorm || key.trim().toLowerCase() === candidate.toLowerCase()) {
        return row[key];
      }
    }
  }
  return undefined;
}

export function parsePayrollExcelRows(rawRows: RawExcelRow[]) {
  const errors = [];
  const employeeMap = new Map<string, {
    employeeCode: string;
    fullName: string;
    workedHours: number;
    allowances: bigint;
    bonuses: bigint;
    deductions: bigint;
    notes: string[];
  }>();

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i] as Record<string, unknown>;
    const rawCode = extractCellValue(row, [
      "Mã NV",
      "Mã nhân viên",
      "Ma NV",
      "Ma nhan vien",
      "Code",
      "Employee Code",
      "ID",
    ]);
    const code = String(rawCode || "").trim();
    if (!code) continue; // Skip empty rows

    const hoursVal = extractCellValue(row, [
      "Số giờ làm việc",
      "Số giờ",
      "Giờ làm việc",
      "Giờ làm",
      "Giờ công",
      "So gio lam viec",
      "So gio",
      "Hours",
      "Worked Hours",
    ]);
    const hoursRaw = Number(hoursVal ?? 0);
    if (isNaN(hoursRaw) || hoursRaw < 0) {
      errors.push({ row: i + 2, code, message: "Số giờ làm việc không hợp lệ (phải là số >= 0)" });
      continue;
    }

    const allowancesVal = extractCellValue(row, [
      "Phụ cấp (VNĐ)",
      "Phụ cấp",
      "Phu cap",
      "Allowances",
    ]);
    const bonusesVal = extractCellValue(row, [
      "Thưởng (VNĐ)",
      "Thưởng",
      "Thuong",
      "Bonuses",
    ]);
    const deductionsVal = extractCellValue(row, [
      "Khấu trừ/Tạm ứng (VNĐ)",
      "Khấu trừ",
      "Tạm ứng",
      "Tam ung",
      "Khau tru",
      "Deductions",
      "Advance",
    ]);
    const notesVal = extractCellValue(row, [
      "Ghi chú",
      "Ghi chu",
      "Notes",
      "Lý do",
    ]);

    const allowances = Math.max(0, Math.round(Number(allowancesVal ?? 0) || 0));
    const bonuses = Math.max(0, Math.round(Number(bonusesVal ?? 0) || 0));
    const deductions = Math.max(0, Math.round(Number(deductionsVal ?? 0) || 0));
    const note = String(notesVal || "").trim();

    const upperCode = code.toUpperCase();
    const existing = employeeMap.get(upperCode);
    if (existing) {
      // Aggregate multiple shifts/days for same employee code
      existing.workedHours += Number(hoursRaw.toFixed(2));
      existing.allowances += BigInt(allowances);
      existing.bonuses += BigInt(bonuses);
      existing.deductions += BigInt(deductions);
      if (note && !existing.notes.includes(note)) {
        existing.notes.push(note);
      }
    } else {
      const nameVal = extractCellValue(row, [
        "Họ và tên",
        "Họ tên",
        "Ho va ten",
        "Tên",
        "Full Name",
        "Name",
      ]);
      employeeMap.set(upperCode, {
        employeeCode: code,
        fullName: String(nameVal || "").trim(),
        workedHours: Number(hoursRaw.toFixed(2)),
        allowances: BigInt(allowances),
        bonuses: BigInt(bonuses),
        deductions: BigInt(deductions),
        notes: note ? [note] : [],
      });
    }
  }

  const parsed = Array.from(employeeMap.values()).map((emp) => ({
    employeeCode: emp.employeeCode,
    fullName: emp.fullName,
    workedHours: Number(emp.workedHours.toFixed(2)),
    allowances: emp.allowances,
    bonuses: emp.bonuses,
    deductions: emp.deductions,
    notes: emp.notes.join("; "),
  }));

  return { parsed, errors };
}

export function calculateWageFromImport(
  workedHours: number,
  hourlyRate: bigint,
  allowances: bigint = 0n,
  bonuses: bigint = 0n,
  deductions: bigint = 0n,
) {
  // Base pay = round(workedHours * hourlyRate)
  const basePay = BigInt(Math.round(workedHours * Number(hourlyRate)));
  const netPay = basePay + allowances + bonuses - deductions;
  // Always clamp total pay to >= 0n to prevent negative salary payout
  const totalPay = netPay < 0n ? 0n : netPay;
  return { basePay, totalPay };
}

export interface ParsedPayrollPreviewRow {
  employeeId?: string;
  employeeCode: string;
  fullName: string;
  positionName: string;
  workedHours: number;
  hourlyRateVND: bigint;
  basePayVND: bigint;
  allowancesVND: bigint;
  bonusesVND: bigint;
  deductionsVND: bigint;
  totalPayVND: bigint;
  notes?: string;
  status: "VALID" | "NOT_FOUND" | "INVALID_HOURS";
  message?: string;
}

export interface PayrollExcelPreviewResult {
  periodId: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  totalHours: number;
  totalPayrollVND: bigint;
  rows: ParsedPayrollPreviewRow[];
}

export class PayrollExcelService {
  /**
   * Generates a pre-filled Excel template (.xlsx) with all active employees
   */
  async generateTemplate(periodId: string): Promise<{ filename: string; buffer: Buffer }> {
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        items: true,
      },
    });

    if (!period) {
      throw new AppNotFoundError("Không tìm thấy kỳ lương");
    }

    const employees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ primaryPosition: { sortOrder: "asc" } }, { employeeCode: "asc" }],
      include: {
        primaryPosition: { select: { name: true } },
      },
    });

    const itemMap = new Map(period.items.map((i) => [i.employeeId, i]));

    const dataRows = employees.map((emp) => {
      const existing = itemMap.get(emp.id);
      return {
        "Mã NV": emp.employeeCode,
        "Họ và tên": emp.fullName,
        "Chức vụ": emp.primaryPosition?.name || "Nhân viên",
        "Số giờ làm việc": existing ? Number(existing.workedHours) : 0,
        "Phụ cấp (VNĐ)": existing ? Number(existing.allowances) : 0,
        "Thưởng (VNĐ)": existing ? Number(existing.bonuses) : 0,
        "Khấu trừ/Tạm ứng (VNĐ)": existing ? Number(existing.deductions) : 0,
        "Ghi chú": existing?.adjustmentReason || "",
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataRows);

    // Set column widths
    ws["!cols"] = [
      { wch: 12 }, // Mã NV
      { wch: 26 }, // Họ và tên
      { wch: 18 }, // Chức vụ
      { wch: 18 }, // Số giờ làm việc
      { wch: 18 }, // Phụ cấp
      { wch: 16 }, // Thưởng
      { wch: 22 }, // Khấu trừ
      { wch: 30 }, // Ghi chú
    ];

    XLSX.utils.book_append_sheet(wb, ws, "BangGioCong");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const safePeriodName = period.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `MauChamCong_Dlat_${safePeriodName}.xlsx`;

    return { filename, buffer };
  }

  /**
   * Parses uploaded Excel file buffer and returns validation preview
   */
  async previewExcel(
    periodId: string,
    fileBuffer: Buffer,
  ): Promise<PayrollExcelPreviewResult> {
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      throw new AppNotFoundError("Không tìm thấy kỳ lương");
    }

    if (period.status === "LOCKED" || period.status === "PAID" || period.status === "APPROVED") {
      throw new AppValidationError("Kỳ lương đã được phê duyệt, khóa hoặc đã thanh toán, không thể nhập dữ liệu mới");
    }

    // Read workbook
    const wb = XLSX.read(fileBuffer, { type: "buffer" });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      throw new AppValidationError("File Excel rỗng, không có bảng dữ liệu");
    }

    const ws = wb.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<RawExcelRow>(ws!);

    if (rawRows.length === 0) {
      throw new AppValidationError("Không tìm thấy dòng dữ liệu nào trong file Excel");
    }

    // Parse rows using tested parser
    const { parsed, errors } = parsePayrollExcelRows(rawRows);

    // Fetch all active employees with their current effective PayRate for periodEnd
    const employees = await prisma.employee.findMany({
      include: {
        primaryPosition: { select: { name: true } },
        payRates: {
          where: {
            effectiveFrom: { lte: period.periodEnd },
          },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });

    const empMap = new Map(employees.map((e) => [e.employeeCode.toUpperCase(), e]));

    const previewRows: ParsedPayrollPreviewRow[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let totalHours = 0;
    let totalPayrollVND = 0n;

    for (const item of parsed) {
      const emp = empMap.get(item.employeeCode.toUpperCase());
      if (!emp) {
        invalidCount++;
        previewRows.push({
          employeeCode: item.employeeCode,
          fullName: item.fullName || "Không tìm thấy",
          positionName: "-",
          workedHours: item.workedHours,
          hourlyRateVND: 0n,
          basePayVND: 0n,
          allowancesVND: item.allowances,
          bonusesVND: item.bonuses,
          deductionsVND: item.deductions,
          totalPayVND: 0n,
          notes: item.notes,
          status: "NOT_FOUND",
          message: "Mã nhân viên không tồn tại trong hệ thống D'lat Cafe",
        });
        continue;
      }

      const hourlyRate = emp.payRates[0]?.hourlyRate ?? 0n;
      const { basePay, totalPay } = calculateWageFromImport(
        item.workedHours,
        hourlyRate,
        item.allowances,
        item.bonuses,
        item.deductions,
      );

      validCount++;
      totalHours += item.workedHours;
      totalPayrollVND += totalPay;

      previewRows.push({
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        positionName: emp.primaryPosition?.name || "Nhân viên",
        workedHours: item.workedHours,
        hourlyRateVND: hourlyRate,
        basePayVND: basePay,
        allowancesVND: item.allowances,
        bonusesVND: item.bonuses,
        deductionsVND: item.deductions,
        totalPayVND: totalPay,
        notes: item.notes,
        status: "VALID",
      });
    }

    // Add format errors if any
    for (const err of errors) {
      invalidCount++;
      previewRows.push({
        employeeCode: err.code,
        fullName: "-",
        positionName: "-",
        workedHours: 0,
        hourlyRateVND: 0n,
        basePayVND: 0n,
        allowancesVND: 0n,
        bonusesVND: 0n,
        deductionsVND: 0n,
        totalPayVND: 0n,
        status: "INVALID_HOURS",
        message: err.message,
      });
    }

    return {
      periodId: period.id,
      periodName: period.name,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      totalRows: previewRows.length,
      validCount,
      invalidCount,
      totalHours: Number(totalHours.toFixed(2)),
      totalPayrollVND,
      rows: previewRows,
    };
  }

  /**
   * Applies the parsed and verified rows into database PayrollItem records
   */
  async applyImport(
    periodId: string,
    rows: ParsedPayrollPreviewRow[],
    actor: SessionUser,
  ) {
    assertPermission(actor.role, "payroll:calculate");

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      throw new AppNotFoundError("Không tìm thấy kỳ lương");
    }

    if (period.status === "LOCKED" || period.status === "PAID" || period.status === "APPROVED") {
      throw new AppValidationError("Kỳ lương đã được phê duyệt, khóa hoặc đã thanh toán");
    }

    const validRows = rows.filter((r) => r.status === "VALID" && r.employeeId);
    if (validRows.length === 0) {
      throw new AppValidationError("Không có dòng hợp lệ nào để áp dụng");
    }

    // Server-side calculation integrity: re-verify genuine hourly rates from database
    const empIds = validRows.map((r) => r.employeeId!);
    const dbEmployees = await prisma.employee.findMany({
      where: { id: { in: empIds } },
      select: {
        id: true,
        payRates: {
          where: { effectiveFrom: { lte: period.periodEnd } },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: { hourlyRate: true },
        },
      },
    });
    const dbRateMap = new Map(dbEmployees.map((e) => [e.id, e.payRates[0]?.hourlyRate ?? 0n]));

    await prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const authenticHourlyRate = dbRateMap.get(row.employeeId!) ?? 0n;
        const { basePay, totalPay } = calculateWageFromImport(
          row.workedHours,
          authenticHourlyRate,
          row.allowancesVND,
          row.bonusesVND,
          row.deductionsVND,
        );

        await tx.payrollItem.upsert({
          where: {
            payrollPeriodId_employeeId: {
              payrollPeriodId: periodId,
              employeeId: row.employeeId!,
            },
          },
          update: {
            workedHours: row.workedHours,
            paidHours: row.workedHours,
            hourlyRateSnapshot: authenticHourlyRate,
            basePay,
            overtimePay: 0n,
            allowances: row.allowancesVND,
            bonuses: row.bonusesVND,
            deductions: row.deductionsVND,
            adjustmentReason: row.notes || null,
            totalPay,
          },
          create: {
            payrollPeriodId: periodId,
            employeeId: row.employeeId!,
            scheduledHours: row.workedHours,
            workedHours: row.workedHours,
            approvedHours: row.workedHours,
            paidHours: row.workedHours,
            overtimeHours: 0,
            hourlyRateSnapshot: authenticHourlyRate,
            basePay,
            overtimePay: 0n,
            allowances: row.allowancesVND,
            bonuses: row.bonusesVND,
            deductions: row.deductionsVND,
            adjustments: 0n,
            adjustmentReason: row.notes || null,
            totalPay,
          },
        });
      }

      // Transition period status to CALCULATED
      await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: "CALCULATED",
        },
      });

      // Record audit log
      await recordAuditLog(
        {
          userId: actor.userId,
          action: "PAYROLL_EXCEL_IMPORTED",
          entityType: "PayrollPeriod",
          entityId: periodId,
          newValues: {
            itemCount: validRows.length,
            totalPayrollVND: validRows.reduce((sum, r) => sum + r.totalPayVND, 0n).toString(),
          },
        },
        tx,
      );
    });

    return {
      success: true,
      message: `Đã cập nhật bảng lương thành công cho ${validRows.length} nhân sự`,
      updatedCount: validRows.length,
    };
  }
}

export const payrollExcelService = new PayrollExcelService();
