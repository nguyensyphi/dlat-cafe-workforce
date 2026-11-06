import { requireServerSession } from "@/lib/auth";
import { payrollService } from "@/modules/payroll/payroll.service";
import { PayrollManagementClient } from "@/components/payroll/payroll-management-client";

export default async function PayrollPage() {
  const actor = await requireServerSession("payroll:calculate");
  const periods = await payrollService.listPeriods(actor);

  return <PayrollManagementClient initialPeriods={periods} />;
}
