import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  AppForbiddenError,
  AppUnauthorizedError,
  assertPermission,
  type Permission,
} from "@/lib/permissions";
import {
  SESSION_COOKIE_NAME,
  getSessionTtlSeconds,
  signSessionToken,
  verifySessionToken,
  type SessionUser,
} from "@/lib/jwt";

export {
  SESSION_COOKIE_NAME,
  getSessionTtlSeconds,
  signSessionToken,
  verifySessionToken,
  type SessionUser,
};

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, 10);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

export async function getActiveSessionFromToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  const decoded = await verifySessionToken(token);
  if (!decoded) {
    return null;
  }

  // Always check live user status in DB so deactivated accounts lose access immediately
  const dbUser = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: {
      employee: {
        select: { id: true, fullName: true, status: true },
      },
    },
  });

  if (!dbUser || !dbUser.isActive) {
    return null;
  }

  if (dbUser.employee && dbUser.employee.status === "INACTIVE") {
    return null;
  }

  return {
    userId: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    employeeId: dbUser.employee?.id ?? null,
    fullName: dbUser.employee?.fullName ?? dbUser.email,
  };
}

export async function getServerSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return getActiveSessionFromToken(token);
}

export async function requireServerSession(
  requiredPermission?: Permission,
): Promise<SessionUser> {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  if (requiredPermission) {
    try {
      assertPermission(session.role, requiredPermission);
    } catch (err) {
      if (err instanceof AppForbiddenError) {
        redirect(
          session.role === "EMPLOYEE" ? "/employee/profile" : "/dashboard",
        );
      }
      throw err;
    }
  }

  return session;
}

export async function requireApiSession(
  requiredPermission?: Permission,
): Promise<SessionUser> {
  const session = await getServerSession();
  if (!session) {
    throw new AppUnauthorizedError();
  }
  if (requiredPermission) {
    assertPermission(session.role, requiredPermission);
  }
  return session;
}

