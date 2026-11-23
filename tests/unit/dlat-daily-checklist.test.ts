import { describe, expect, it } from "vitest";
import {
  DLAT_DAILY_CHECKLIST_TEMPLATES,
  getChecklistForShift,
  resolveShiftCodeFromShift,
  validateDailyChecklistCompletion,
} from "@/modules/handover/dlat-daily-checklist";

describe("D'Lat Daily Shift Checklist (4 shifts + periodic day rules)", () => {
  it("contains exact item counts matching the physical D'Lat checklist sheet", () => {
    expect(DLAT_DAILY_CHECKLIST_TEMPLATES.CA_1).toHaveLength(19);
    expect(DLAT_DAILY_CHECKLIST_TEMPLATES.CA_2).toHaveLength(12);
    expect(DLAT_DAILY_CHECKLIST_TEMPLATES.CA_3).toHaveLength(12);
    expect(DLAT_DAILY_CHECKLIST_TEMPLATES.CA_4).toHaveLength(19);
  });

  it("resolves shift codes from templateCode, shift name, or startTime", () => {
    expect(resolveShiftCodeFromShift("Ca 1 (07:00–11:00)", "CA_1", "07:00")).toBe("CA_1");
    expect(resolveShiftCodeFromShift("Ca 2 (11:00–15:00)", null, "11:00")).toBe("CA_2");
    expect(resolveShiftCodeFromShift("Ca 3", null, "15:00")).toBe("CA_3");
    expect(resolveShiftCodeFromShift("Ca 4 Tối", null, "19:00")).toBe("CA_4");
  });

  it("shows all items while marking periodic tasks due only on matching days of week", () => {
    // 2026-11-16 = Monday (T2): Ca 1 item 9 (Lau lá cây T2-4-6) is due; Ca 4 item 7 (Kiểm kho T2,5) is due, item 12 (T4) & item 18 (T6) are NOT due
    const ca1Mon = getChecklistForShift("CA_1", "2026-11-16");
    expect(ca1Mon).toHaveLength(19);
    expect(ca1Mon.find((i) => i.stt === 9)?.isDueToday).toBe(true);

    const ca4Mon = getChecklistForShift("CA_4", "2026-11-16");
    expect(ca4Mon).toHaveLength(19);
    expect(ca4Mon.find((i) => i.stt === 7)?.isDueToday).toBe(true);
    expect(ca4Mon.find((i) => i.stt === 12)?.isDueToday).toBe(false);
    expect(ca4Mon.find((i) => i.stt === 18)?.isDueToday).toBe(false);

    // 2026-11-20 = Friday (T6): Ca 4 item 18 (Chà sàn quầy nước tối T6) is due
    const ca4Fri = getChecklistForShift("CA_4", "2026-11-20");
    expect(ca4Fri.find((i) => i.stt === 18)?.isDueToday).toBe(true);
    expect(ca4Fri.find((i) => i.stt === 7)?.isDueToday).toBe(false);
  });

  it("requires a reason note if an item due today is unchecked, but allows unchecked non-due periodic items", () => {
    // Sunday 2026-11-22: Ca 1 item 9 (T2-4-6) is NOT due today
    const ca1Sun = getChecklistForShift("CA_1", "2026-11-22");
    // Mark all daily items done, leave item 9 unchecked without note -> valid!
    const allDailyDone = ca1Sun.map((item) =>
      item.isDueToday ? { ...item, done: true } : item,
    );
    expect(validateDailyChecklistCompletion(allDailyDone).isValid).toBe(true);

    // Uncheck item 8 (Lau kính, daily) without note -> invalid!
    const missingReason = allDailyDone.map((item) =>
      item.stt === 8 ? { ...item, done: false, note: "" } : item,
    );
    const resInvalid = validateDailyChecklistCompletion(missingReason);
    expect(resInvalid.isValid).toBe(false);
    expect(resInvalid.missingItems.map((m) => m.stt)).toEqual([8]);

    // Add reason note for item 8 -> valid!
    const withReason = missingReason.map((item) =>
      item.stt === 8 ? { ...item, note: "Hết nước lau kính, đã báo quản lý mua thêm" } : item,
    );
    expect(validateDailyChecklistCompletion(withReason).isValid).toBe(true);
  });
});

