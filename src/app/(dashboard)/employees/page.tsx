import { requireServerSession } from "@/lib/auth";
import { employeeService } from "@/modules/employees/employee.service";
import { positionService } from "@/modules/positions/position.service";
import { EmployeesDirectoryClient } from "@/components/employee/employees-directory-client";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const actor = await requireServerSession("employees:read");
  const [employees, positions] = await Promise.all([
    employeeService.listEmployees(actor, { status: "ALL" }),
    positionService.listPositions(actor, { includeInactive: false }),
  ]);

  return (
    <EmployeesDirectoryClient
      initialEmployees={employees}
      positions={positions}
      actorRole={actor.role}
    />
  );
}

