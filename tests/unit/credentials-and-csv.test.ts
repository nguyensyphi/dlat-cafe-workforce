import { describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth";
import {
  validatePasswordStrength,
  validatePinFormat,
} from "@/modules/auth/credentials.service";
import { verifyEmployeePin } from "@/modules/availability/public-registration.service";
import {
  generateEmployeeCsvTemplate,
  normalizePhoneDigits,
  parseCsvText,
} from "@/modules/employees/employee-csv.service";
import { parseGoLiveResetArgs } from "@/modules/ops/go-live-reset.service";

describe("Pha 1 Unit Tests — Password/PIN Validation, CSV Parser & go-live-reset CLI Args", () => {
  describe("validatePasswordStrength", () => {
    it("rejects short or weak passwords", () => {
      expect(validatePasswordStrength("Ab1").valid).toBe(false);
      expect(validatePasswordStrength("alllowercase123").valid).toBe(false);
      expect(validatePasswordStrength("ALLUPPERCASE123").valid).toBe(false);
      expect(validatePasswordStrength("NoDigitsHere").valid).toBe(false);
    });

    it("accepts strong passwords", () => {
      expect(validatePasswordStrength("DlatCafe@2026").valid).toBe(true);
      expect(validatePasswordStrength("MatKhau99").valid).toBe(true);
    });
  });

  describe("validatePinFormat & verifyEmployeePin", () => {
    it("rejects invalid PIN formats and repeating digits", () => {
      expect(validatePinFormat("123").valid).toBe(false);
      expect(validatePinFormat("1234567").valid).toBe(false);
      expect(validatePinFormat("12ab").valid).toBe(false);
      expect(validatePinFormat("0000").valid).toBe(false);
      expect(validatePinFormat("777777").valid).toBe(false);
    });

    it("accepts 4 to 6 non-repeating numeric digits", () => {
      expect(validatePinFormat("2589").valid).toBe(true);
      expect(validatePinFormat("482910").valid).toBe(true);
    });

    it("verifies custom bcrypt pinHash when set and falls back to last 4 phone digits when null", async () => {
      expect(await verifyEmployeePin("0903111222", "1222", null)).toBe(true);
      expect(await verifyEmployeePin("0903111222", "9999", null)).toBe(false);

      const customHash = await hashPassword("4829");
      expect(await verifyEmployeePin("0903111222", "4829", customHash)).toBe(true);
      // Old phone last-4 must no longer work once custom pinHash is set
      expect(await verifyEmployeePin("0903111222", "1222", customHash)).toBe(false);
    });
  });

  describe("CSV parser & template", () => {
    it("parses UTF-8 BOM, CRLF, quoted commas, and escaped double quotes", () => {
      const raw =
        '\uFEFFma_nv,ho_ten,ghi_chu\r\nNV101,"Nguyễn, Văn An","Ca sáng ""ưu tiên"""\r\n\r\nNV102,Trần Bình,Thường\n';
      const rows = parseCsvText(raw);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual(["ma_nv", "ho_ten", "ghi_chu"]);
      expect(rows[1]).toEqual([
        "NV101",
        "Nguyễn, Văn An",
        'Ca sáng "ưu tiên"',
      ]);
      expect(rows[2]).toEqual(["NV102", "Trần Bình", "Thường"]);
    });

    it("generates UTF-8 BOM Vietnamese CSV template with headers and sample rows", () => {
      const tpl = generateEmployeeCsvTemplate();
      expect(tpl.startsWith("\uFEFF")).toBe(true);
      const rows = parseCsvText(tpl);
      expect(rows.length).toBeGreaterThanOrEqual(3);
      expect(rows[0]).toContain("ma_nv");
      expect(rows[0]).toContain("so_dien_thoai");
      expect(rows[0]).toContain("chuc_vu_chinh");
    });

    it("normalizes phone digits across formatting variations", () => {
      expect(normalizePhoneDigits("0905-123.456")).toBe("0905123456");
      expect(normalizePhoneDigits("0905 123 456")).toBe("0905123456");
    });
  });

  describe("parseGoLiveResetArgs", () => {
    it("parses --dry-run and --confirm flags safely", () => {
      const dry = parseGoLiveResetArgs(["--dry-run"]);
      expect(dry.dryRun).toBe(true);
      expect(dry.confirm).toBe(false);

      const full = parseGoLiveResetArgs([
        "--confirm",
        "--owner-email",
        "Owner@Dlat.vn",
        "--owner-password",
        "StrongPass123",
        "--owner-name",
        "Chủ Quán",
        "--owner-phone",
        "0909888777",
      ]);
      expect(full.confirm).toBe(true);
      expect(full.owner?.email).toBe("owner@dlat.vn");
      expect(full.owner?.employeeCode).toBe("NV001");
    });

    it("throws when partial owner flags are provided", () => {
      expect(() =>
        parseGoLiveResetArgs(["--confirm", "--owner-email", "a@b.vn"]),
      ).toThrow(/owner-password/);
    });
  });
});
