import { requireServerSession } from "@/lib/auth";
import { reportsService } from "@/modules/reports/reports.service";
import { ReportsDashboardClient } from "@/components/reports/reports-dashboard-client";

export default async function ReportsPage() {
  const actor = await requireServerSession("reports:read");
  const data = await reportsService.getOverviewAnalytics(actor);

  return <ReportsDashboardClient data={data} />;
}

