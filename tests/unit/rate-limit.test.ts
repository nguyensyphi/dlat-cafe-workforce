import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRateLimiter } from "@/lib/rate-limit";

describe("MemoryRateLimiter", () => {
  let limiter: MemoryRateLimiter;

  beforeEach(() => {
    limiter = new MemoryRateLimiter({
      windowMs: 1000, // 1 second
      maxLimit: 3,
    });
  });

  it("cho phép các yêu cầu trong giới hạn", () => {
    const res1 = limiter.check("ip-1");
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = limiter.check("ip-1");
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = limiter.check("ip-1");
    expect(res3.success).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it("chặn các yêu cầu vượt quá giới hạn", () => {
    limiter.check("ip-1");
    limiter.check("ip-1");
    limiter.check("ip-1");

    const blocked = limiter.check("ip-1");
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("phân biệt các identifier khác nhau", () => {
    limiter.check("ip-1");
    limiter.check("ip-1");
    limiter.check("ip-1");

    // ip-2 vẫn phải còn quota
    const resIp2 = limiter.check("ip-2");
    expect(resIp2.success).toBe(true);
    expect(resIp2.remaining).toBe(2);
  });

  it("tự động hồi phục sau khi cửa sổ trượt trôi qua", () => {
    vi.useFakeTimers();
    try {
      limiter.check("ip-1");
      limiter.check("ip-1");
      limiter.check("ip-1");

      expect(limiter.check("ip-1").success).toBe(false);

      // Fast-forward 1050ms
      vi.advanceTimersByTime(1050);

      const recovered = limiter.check("ip-1");
      expect(recovered.success).toBe(true);
      expect(recovered.remaining).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
