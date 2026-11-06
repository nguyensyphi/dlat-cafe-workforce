import { notFound } from "next/navigation";
import { requireServerSession } from "@/lib/auth";
import { AppNotFoundError } from "@/lib/permissions";
import { employeeService } from "@/modules/employees/employee.service";
import { positionService } from "@/modules/positions/position.service";
import { EmployeeDetailClient } from "@/components/employee/employee-detail-client";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireServerSession("employees:read");
  const { id } = await params;

  try {
    const [employee, positions] = await Promise.all([
      employeeService.getEmployeeById(actor, id),
      positionService.listPositions(actor, { includeInactive: false }),
    ]);

    return (
      <EmployeeDetailClient
        employee={employee}
        positions={positions}
        actorRole={actor.role}
      />
    );
  } catch (err) {
    if (err instanceof AppNotFoundError) {
      notFound();
    }
    throw err;
  }
}

