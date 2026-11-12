import { requireServerSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";
import { EmployeeAttendanceClient } from "@/components/employee/employee-attendance-client";

export default async function EmployeeAttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const actor = await requireServerSession("self:attendance");
  const params = searchParams ? await searchParams : {};

  const [todayStatus, history] = await Promise.all([
    attendanceService.getMyTodayStatus(actor),
    attendanceService.getMyAttendances(actor),
  ]);

  return (
    <EmployeeAttendanceClient
      initialTodayStatus={todayStatus}
      history={history}
      urlToken={params.token}
    />
  );
}
