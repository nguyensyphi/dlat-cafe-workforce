import crypto from "crypto";
import os from "os";

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

/**
 * Returns the best candidate IPv4 address for local network (Wi-Fi/LAN) access.
 * Excludes virtual adapters like VMware, WSL, virtualbox, loopback.
 */
export function getLanIpAddress(): string {
  try {
    const interfaces = os.networkInterfaces();
    let fallbackIp: string | null = null;

    for (const name of Object.keys(interfaces)) {
      const lower = name.toLowerCase();
      const isVirtual =
        lower.includes("vmnet") ||
        lower.includes("virtual") ||
        lower.includes("loopback") ||
        lower.includes("wsl") ||
        lower.includes("pseudo");

      for (const net of interfaces[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          if (!isVirtual) {
            return net.address;
          }
          if (!fallbackIp) fallbackIp = net.address;
        }
      }
    }
    return fallbackIp || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}

