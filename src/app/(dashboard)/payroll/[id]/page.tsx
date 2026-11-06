import { requireServerSession } from "@/lib/auth";
import { payrollService } from "@/modules/payroll/payroll.service";
import { PayrollDetailClient } from "@/components/payroll/payroll-detail-client";

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireServerSession("payroll:calculate");
  const { id } = await params;
  const detail = await payrollService.getPeriodDetail(actor, id);
  const canApprove = actor.role === "OWNER";

  return (
    <PayrollDetailClient
      initialPeriod={detail}
      canApprove={canApprove}
    />
  );
}

