import { apiSuccess, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/auth";
import { reportsService } from "@/modules/reports/reports.service";

export async function GET() {
  try {
    const actor = await requireApiSession("reports:read");
    const data = await reportsService.getOverviewAnalytics(actor);
    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}

