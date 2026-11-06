import { requireServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatIsoDateOnly, formatTimeVN } from "@/lib/date";
import { leaveService } from "@/modules/leaves/leave.service";
import { swapService } from "@/modules/swaps/swap.service";
import { EmployeeRequestsClient } from "@/components/employee/employee-requests-client";

export default async function EmployeeRequestsPage() {
  const actor = await requireServerSession("self:requests");

  const [leaves, swaps] = await Promise.all([
    leaveService.listLeaveRequests(actor),
    swapService.listSwaps(actor),
  ]);

  let myShifts: Array<{
    assignmentId: string;
    shiftId: string;
    shiftName: string;
    workDate: string;
    startTime: string;
    endTime: string;
  }> = [];

  let colleagues: Array<{
    id: string;
    fullName: string;
    primaryPositionName: string;
  }> = [];

  if (actor.employeeId) {
    const [assignments, employeeList] = await Promise.all([
      prisma.shiftAssignment.findMany({
        where: {
          employeeId: actor.employeeId,
          status: "ASSIGNED",
          shift: {
            schedule: {
              status: { in: ["PUBLISHED", "DRAFT"] },
            },
          },
        },
        include: {
          shift: true,
        },
        orderBy: {
          shift: {
            startAt: "asc",
          },
        },
        take: 30,
      }),
      prisma.employee.findMany({
        where: {
          status: "ACTIVE",
          id: { not: actor.employeeId },
        },
        select: {
          id: true,
          fullName: true,
          primaryPosition: {
            select: { name: true },
          },
        },
        orderBy: {
          fullName: "asc",
        },
      }),
    ]);

    myShifts = assignments.map((a) => ({
      assignmentId: a.id,
      shiftId: a.shiftId,
      shiftName: a.shift.name,
      workDate: formatIsoDateOnly(a.shift.workDate),
      startTime: formatTimeVN(a.shift.startAt),
      endTime: formatTimeVN(a.shift.endAt),
    }));

    colleagues = employeeList.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      primaryPositionName: e.primaryPosition.name,
    }));
  }

  return (
    <EmployeeRequestsClient
      leaves={leaves}
      swaps={swaps}
      myShifts={myShifts}
      colleagues={colleagues}
      currentEmployeeId={actor.employeeId ?? ""}
    />
  );
}

