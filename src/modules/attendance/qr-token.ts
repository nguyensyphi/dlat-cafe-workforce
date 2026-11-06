import crypto from "crypto";

export function generateSecureToken(): string {
  // Generate 32 bytes of cryptographically secure random bytes
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSecureToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyTokenHash(token: string, expectedHash: string): boolean {
  const actualHash = hashSecureToken(token);
  // Constant time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(actualHash, "hex"),
      Buffer.from(expectedHash, "hex"),
    );
  } catch {
    return false;
  }
}

export function isTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() > expiresAt.getTime();
}

