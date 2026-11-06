import { describe, expect, it } from "vitest";
import {
  generateSecureToken,
  hashSecureToken,
  isTokenExpired,
  verifyTokenHash,
} from "@/modules/attendance/qr-token";

describe("Dynamic QR Attendance Token & Cryptography", () => {
  it("generates a high-entropy CSPRNG random token", () => {
    const token1 = generateSecureToken();
    const token2 = generateSecureToken();

    expect(token1).toBeTruthy();
    expect(token2).toBeTruthy();
    expect(token1).not.toBe(token2);
    // 32 bytes base64url is 43 characters
    expect(token1.length).toBeGreaterThanOrEqual(40);
  });

  it("hashes token deterministically using SHA-256 hex", () => {
    const rawToken = "sample-secure-token-1234567890-abcdef";
    const hash1 = hashSecureToken(rawToken);
    const hash2 = hashSecureToken(rawToken);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    expect(verifyTokenHash(rawToken, hash1)).toBe(true);
    expect(verifyTokenHash("wrong-token", hash1)).toBe(false);
  });

  it("correctly identifies expired tokens", () => {
    const futureDate = new Date(Date.now() + 30_000); // 30s in future
    const pastDate = new Date(Date.now() - 5_000); // 5s in past

    expect(isTokenExpired(futureDate)).toBe(false);
    expect(isTokenExpired(pastDate)).toBe(true);
  });
});

