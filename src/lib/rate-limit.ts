/**
 * Memory-based Sliding Window Rate Limiter
 * Suitable for single-instance Node.js server deployment (Coffee shop workforce).
 */

interface RateLimitRecord {
  timestamps: number[];
}

export class MemoryRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private readonly windowMs: number;
  private readonly maxLimit: number;

  constructor(options: { windowMs: number; maxLimit: number }) {
    this.windowMs = options.windowMs;
    this.maxLimit = options.maxLimit;
  }

  /**
   * Checks if an identifier (e.g. IP or userId) exceeds rate limit.
   * Returns { success: boolean, remaining: number, resetMs: number }
   */
  check(identifier: string): {
    success: boolean;
    remaining: number;
    resetMs: number;
  } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let record = this.records.get(identifier);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(identifier, record);
    }

    // Filter out timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.maxLimit) {
      const oldestInWindow = record.timestamps[0] ?? now;
      const resetMs = Math.max(0, oldestInWindow + this.windowMs - now);
      return {
        success: false,
        remaining: 0,
        resetMs,
      };
    }

    record.timestamps.push(now);
    return {
      success: true,
      remaining: this.maxLimit - record.timestamps.length,
      resetMs: this.windowMs,
    };
  }

  /**
   * Resets rate limit for a specific identifier (useful for tests)
   */
  reset(identifier?: string): void {
    if (identifier) {
      this.records.delete(identifier);
    } else {
      this.records.clear();
    }
  }
}

// Pre-configured rate limiters for key routes
export const authRateLimiter = new MemoryRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxLimit: 10, // 10 attempts / min
});

export const attendanceRateLimiter = new MemoryRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxLimit: 30, // 30 scans / min
});

export const kioskRateLimiter = new MemoryRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxLimit: 60, // 60 token requests / min
});

export const calculationRateLimiter = new MemoryRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxLimit: 15, // 15 calculations / min
});

export const registrationRateLimiter = new MemoryRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxLimit: 30, // 30 registration checks / submits per min per IP
});
