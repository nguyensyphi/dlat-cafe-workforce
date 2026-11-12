import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerSession } from "@/lib/auth";
import { todayDateStringVN, formatTimeVN } from "@/lib/date";
import { ShiftHandoverWizard } from "@/components/employee/shift-handover-wizard";

export default async function EmployeeHandoverPage() {
  const actor = await requireServerSession();
  if (!actor.employeeId) {
    redirect("/login");
  }

  const todayStr = todayDateStringVN();
  const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

  // Find employee profile
  const employee = await prisma.employee.findUnique({
    where: { id: actor.employeeId },
    select: { id: true, fullName: true, employeeCode: true },
  });

  if (!employee) {
    redirect("/login");
  }

  // Find shift assignment for today
  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      employeeId: employee.id,
      shift: {
        workDate: todayDate,
      },
    },
    include: {
      shift: {
        include: { template: true },
      },
    },
  });

  // Fallback to any shift today if no exact assignment match
  let targetShift = assignment?.shift;
  if (!targetShift) {
    const fallback = await prisma.shift.findFirst({
      where: { workDate: todayDate },
      include: { template: true },
      orderBy: { startAt: "asc" },
    });
    if (fallback) {
      targetShift = fallback;
    }
  }

  const shiftData = targetShift
    ? {
        id: targetShift.id,
        workDate: todayStr,
        name: targetShift.name,
        startTime: targetShift.template?.startTime ?? formatTimeVN(targetShift.startAt),
        endTime: targetShift.template?.endTime ?? formatTimeVN(targetShift.endAt),
      }
    : {
        id: "shift-today-fallback",
        workDate: todayStr,
        name: "Ca sáng D'Lat",
        startTime: "06:00",
        endTime: "12:00",
      };

  // Find colleagues who can receive handover
  const colleagues = await prisma.employee.findMany({
    where: {
      id: { not: employee.id },
      status: "ACTIVE",
    },
    select: { id: true, fullName: true, employeeCode: true },
    orderBy: { fullName: "asc" },
  });

  return (
    <div className="py-6 px-4">
      <div className="max-w-3xl mx-auto mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Biên bản Bàn giao ca</h1>
        <p className="text-sm text-muted-foreground">
          Hoàn tất 8 hạng mục bàn giao ca trước khi chấm ra (Clock-out)
        </p>
      </div>
      <ShiftHandoverWizard
        shift={shiftData}
        currentEmployee={employee}
        colleagues={colleagues}
      />
    </div>
  );
}
