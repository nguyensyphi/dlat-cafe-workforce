import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";

export interface SessionUser {
  userId: string;
  email: string;
  role: UserRole;
  employeeId: string | null;
  fullName: string;
}

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? "cafe_wf_session";

function getJwtSecretKey(): Uint8Array {
  const raw =
    process.env.JWT_SECRET ??
    "dlat-cafe-workforce-dev-jwt-secret-key-at-least-32-bytes-long-2026";
  return new TextEncoder().encode(raw);
}

export function getSessionTtlSeconds(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? "168");
  return Number.isFinite(hours) && hours > 0 ? hours * 3600 : 7 * 24 * 3600;
}

export async function signSessionToken(payload: SessionUser): Promise<string> {
  const ttlSeconds = getSessionTtlSeconds();
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    employeeId: payload.employeeId,
    fullName: payload.fullName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(getJwtSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ["HS256"],
    });
    const userId = payload.sub;
    const email = payload.email;
    const role = payload.role;
    const fullName = payload.fullName;
    const employeeId = payload.employeeId;

    if (
      typeof userId !== "string" ||
      typeof email !== "string" ||
      (role !== "OWNER" && role !== "MANAGER" && role !== "EMPLOYEE") ||
      typeof fullName !== "string"
    ) {
      return null;
    }

    return {
      userId,
      email,
      role,
      employeeId: typeof employeeId === "string" ? employeeId : null,
      fullName,
    };
  } catch {
    return null;
  }
}

