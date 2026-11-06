import { apiSuccess, handleApiError } from "@/lib/api-response";
import { SESSION_COOKIE_NAME, getServerSession } from "@/lib/auth";
import { recordAuditLog } from "@/modules/audit/audit.service";

export async function POST() {
  try {
    const session = await getServerSession();
    if (session) {
      await recordAuditLog({
        userId: session.userId,
        action: "AUTH_LOGOUT",
        entityType: "User",
        entityId: session.userId,
      });
    }

    const response = apiSuccess({ loggedOut: true });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

