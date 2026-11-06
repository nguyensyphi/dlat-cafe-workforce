import { requireServerSession } from "@/lib/auth";
import { payrollService } from "@/modules/payroll/payroll.service";
import { EmployeePayrollClient } from "@/components/employee/employee-payroll-client";

export default async function EmployeePayrollPage() {
  const actor = await requireServerSession("self:payroll");
  const items = await payrollService.getMyPayrollHistory(actor);

  return <EmployeePayrollClient items={items} />;
}

