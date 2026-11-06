import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireApiSession();
    return apiSuccess({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

