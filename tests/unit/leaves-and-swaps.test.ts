import { describe, expect, it } from "vitest";
import {
  createLeaveRequestSchema,
  reviewLeaveRequestSchema,
} from "@/modules/leaves/leave.validation";
import {
  createSwapRequestSchema,
  respondSwapSchema,
  reviewSwapSchema,
} from "@/modules/swaps/swap.validation";

describe("Leave and Shift Swap Validation & Rules", () => {
  describe("Leave Request Validation", () => {
    it("accepts a valid leave request with start time before end time", () => {
      const parsed = createLeaveRequestSchema.safeParse({
        startAt: "2026-11-10T00:00:00.000Z",
        endAt: "2026-11-10T23:59:59.000Z",
        reason: "Em bị sốt xuất huyết cần đi bệnh viện khám",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects leave request when endAt is earlier than startAt", () => {
      const parsed = createLeaveRequestSchema.safeParse({
        startAt: "2026-11-10T12:00:00.000Z",
        endAt: "2026-11-10T08:00:00.000Z",
        reason: "Xin phép nghỉ việc bận gia đình",
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0]?.message).toContain(
          "Thời gian kết thúc phải sau thời gian bắt đầu",
        );
      }
    });

    it("rejects leave request with too short reason (< 5 characters)", () => {
      const parsed = createLeaveRequestSchema.safeParse({
        startAt: "2026-11-10T08:00:00.000Z",
        endAt: "2026-11-10T16:00:00.000Z",
        reason: "Nghỉ",
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0]?.message).toContain(
          "Lý do xin nghỉ tối thiểu 5 ký tự",
        );
      }
    });

    it("validates review payload properly", () => {
      const approved = reviewLeaveRequestSchema.safeParse({
        status: "APPROVED",
        reviewNote: "Đã duyệt, chúc em mau khỏe",
      });
      expect(approved.success).toBe(true);

      const invalid = reviewLeaveRequestSchema.safeParse({
        status: "PENDING",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("Shift Swap Validation", () => {
    const validShiftId = "11111111-1111-1111-1111-111111111111";
    const validTargetEmployeeId = "22222222-2222-2222-2222-222222222222";

    it("validates shift swap creation with UUIDs and optional reason", () => {
      const valid = createSwapRequestSchema.safeParse({
        shiftId: validShiftId,
        targetEmployeeId: validTargetEmployeeId,
        reason: "Bận thi học kỳ sáng thứ 3",
      });
      expect(valid.success).toBe(true);

      const invalidUuid = createSwapRequestSchema.safeParse({
        shiftId: "not-a-uuid",
        targetEmployeeId: validTargetEmployeeId,
      });
      expect(invalidUuid.success).toBe(false);
    });

    it("validates target colleague response payload (accept or decline)", () => {
      const accept = respondSwapSchema.safeParse({ accept: true });
      expect(accept.success).toBe(true);

      const decline = respondSwapSchema.safeParse({ accept: false });
      expect(decline.success).toBe(true);

      const invalid = respondSwapSchema.safeParse({ accept: "yes" });
      expect(invalid.success).toBe(false);
    });

    it("validates manager final review payload", () => {
      const approved = reviewSwapSchema.safeParse({
        approved: true,
        reviewNote: "Duyệt đổi ca",
      });
      expect(approved.success).toBe(true);

      const rejected = reviewSwapSchema.safeParse({
        approved: false,
        reviewNote: "Ca này cần Barista cứng hơn",
      });
      expect(rejected.success).toBe(true);
    });
  });
});

