import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parsePayrollExcelRows,
  calculateWageFromImport,
  type RawExcelRow,
} from "../../src/modules/payroll/excel-import.service";

describe("Payroll Excel Import Logic", () => {
  it("TC_EXCEL_01: parses valid excel rows and normalizes numbers", () => {
    const raw: RawExcelRow[] = [
      {
        "Mã NV": "NV001",
        "Họ và tên": "Nguyễn Minh Khởi",
        "Số giờ làm việc": 140.5,
        "Phụ cấp (VNĐ)": 500000,
        "Thưởng (VNĐ)": 200000,
        "Khấu trừ/Tạm ứng (VNĐ)": 0,
        "Ghi chú": "Làm đủ công",
      },
      {
        "Mã NV": "NV004",
        "Họ và tên": "Phạm Ngọc Ánh",
        "Số giờ làm việc": 120,
        "Phụ cấp (VNĐ)": "300000",
        "Thưởng (VNĐ)": "100000",
        "Khấu trừ/Tạm ứng (VNĐ)": "500000",
      },
    ];

    const { parsed, errors } = parsePayrollExcelRows(raw);
    expect(errors).toHaveLength(0);
    expect(parsed).toHaveLength(2);

    expect(parsed[0]?.employeeCode).toBe("NV001");
    expect(parsed[0]?.workedHours).toBe(140.5);
    expect(parsed[0]?.allowances).toBe(500000n);

    expect(parsed[1]?.employeeCode).toBe("NV004");
    expect(parsed[1]?.workedHours).toBe(120);
    expect(parsed[1]?.deductions).toBe(500000n);
  });

  it("TC_EXCEL_02: flags negative or invalid hours as errors", () => {
    const raw: RawExcelRow[] = [
      {
        "Mã NV": "NV002",
        "Số giờ làm việc": -10,
      },
      {
        "Mã NV": "NV003",
        "Số giờ làm việc": "abc",
      },
    ];

    const { parsed, errors } = parsePayrollExcelRows(raw);
    expect(parsed).toHaveLength(0);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.code).toBe("NV002");
    expect(errors[1]?.code).toBe("NV003");
  });

  it("TC_EXCEL_03: calculates wages accurately based on worked hours and hourly rate", () => {
    // 140.5 hours * 32,000 VND = 4,496,000 VND
    // allowances 500k + bonus 200k = 700k
    // total = 5,196,000 VND
    const wage = calculateWageFromImport(140.5, 32000n, 500000n, 200000n, 0n);
    expect(wage.basePay).toBe(4496000n);
    expect(wage.totalPay).toBe(5196000n);

    // 100 hours * 25,000 VND = 2,500,000 VND, deduction 500k = 2,000,000 VND
    const wage2 = calculateWageFromImport(100, 25000n, 0n, 0n, 500000n);
    expect(wage2.basePay).toBe(2500000n);
    expect(wage2.totalPay).toBe(2000000n);
  });

  it("TC_EXCEL_04: generates and reads an actual XLSX binary workbook", () => {
    const data = [
      {
        "Mã NV": "NV001",
        "Họ và tên": "Nguyễn Minh Khởi",
        "Vị trí": "Chủ quán",
        "Số giờ làm việc": 150,
        "Phụ cấp (VNĐ)": 0,
        "Thưởng (VNĐ)": 0,
        "Khấu trừ/Tạm ứng (VNĐ)": 0,
        "Ghi chú": "",
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "BangChamCong");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Read back
    const readWb = XLSX.read(buf, { type: "buffer" });
    const sheetName = readWb.SheetNames[0];
    expect(sheetName).toBe("BangChamCong");

    const sheet = readWb.Sheets[sheetName!];
    const rows = XLSX.utils.sheet_to_json<RawExcelRow>(sheet!);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["Mã NV"]).toBe("NV001");
    expect(rows[0]?.["Số giờ làm việc"]).toBe(150);
  });

  it("TC_EXCEL_05: aggregates duplicate rows for the same employee without losing hours or allowances", () => {
    // POS export with 3 shifts for NV004
    const raw: RawExcelRow[] = [
      {
        "Mã NV": "NV004",
        "Họ và tên": "Phạm Ngọc Ánh",
        "Số giờ làm việc": 5.5,
        "Phụ cấp (VNĐ)": 50000,
        "Thưởng (VNĐ)": 0,
        "Khấu trừ/Tạm ứng (VNĐ)": 0,
        "Ghi chú": "Ca sáng 10/11",
      },
      {
        "Mã NV": "NV004",
        "Họ và tên": "Phạm Ngọc Ánh",
        "Số giờ làm việc": 6,
        "Phụ cấp (VNĐ)": 50000,
        "Thưởng (VNĐ)": 100000,
        "Khấu trừ/Tạm ứng (VNĐ)": 0,
        "Ghi chú": "Ca chiều 11/11",
      },
      {
        "Mã NV": "NV004",
        "Họ và tên": "Phạm Ngọc Ánh",
        "Số giờ làm việc": 4.5,
        "Phụ cấp (VNĐ)": 0,
        "Thưởng (VNĐ)": 0,
        "Khấu trừ/Tạm ứng (VNĐ)": 200000,
        "Ghi chú": "Ca tối 12/11",
      },
    ];

    const { parsed, errors } = parsePayrollExcelRows(raw);
    expect(errors).toHaveLength(0);
    expect(parsed).toHaveLength(1); // Aggregated into 1 employee record

    const aggregated = parsed[0]!;
    expect(aggregated.employeeCode).toBe("NV004");
    expect(aggregated.workedHours).toBe(16); // 5.5 + 6 + 4.5 = 16h
    expect(aggregated.allowances).toBe(100000n); // 50k + 50k
    expect(aggregated.bonuses).toBe(100000n);
    expect(aggregated.deductions).toBe(200000n);
    expect(aggregated.notes).toContain("Ca sáng 10/11");
    expect(aggregated.notes).toContain("Ca chiều 11/11");
    expect(aggregated.notes).toContain("Ca tối 12/11");
  });

  it("TC_EXCEL_06: supports flexible column aliases from external POS software", () => {
    const rawPosExport: any[] = [
      {
        "Mã nhân viên": "NV007",
        "Họ tên": "Trần Thị Cúc",
        "Giờ công": "35.5",
        "Phụ cấp": 200000,
        "Thưởng": 50000,
        "Tạm ứng": 500000,
        "Ghi chu": "POS KiotViet export",
      },
    ];

    const { parsed, errors } = parsePayrollExcelRows(rawPosExport);
    expect(errors).toHaveLength(0);
    expect(parsed).toHaveLength(1);

    const row = parsed[0]!;
    expect(row.employeeCode).toBe("NV007");
    expect(row.fullName).toBe("Trần Thị Cúc");
    expect(row.workedHours).toBe(35.5);
    expect(row.allowances).toBe(200000n);
    expect(row.bonuses).toBe(50000n);
    expect(row.deductions).toBe(500000n);
    expect(row.notes).toBe("POS KiotViet export");
  });

  it("TC_EXCEL_07: clamps totalPay to 0n when deductions exceed gross earnings", () => {
    // 10 hours * 25,000 VND = 250,000 VND
    // deduction = 1,000,000 VND (excess advance)
    // totalPay must be clamped to 0n rather than negative
    const wage = calculateWageFromImport(10, 25000n, 0n, 0n, 1000000n);
    expect(wage.basePay).toBe(250000n);
    expect(wage.totalPay).toBe(0n);
  });
});
