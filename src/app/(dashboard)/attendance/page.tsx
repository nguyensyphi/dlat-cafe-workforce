import { requireServerSession } from "@/lib/auth";
import { todayDateStringVN } from "@/lib/date";
import { attendanceService } from "@/modules/attendance/attendance.service";
import { attendanceMonitorService } from "@/modules/attendance/attendance-monitor.service";
import { AttendanceManagementClient } from "@/components/attendance/attendance-management-client";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireServerSession("attendance:manage");
  const params = await searchParams;
  const selectedDate = params.date || todayDateStringVN();

  const [attendances, initialAlerts] = await Promise.all([
    attendanceService.listAttendances(actor, {
      workDate: selectedDate,
    }),
    attendanceMonitorService.getActiveAttendanceAlerts({
      workDate: selectedDate,
    }),
  ]);

  return (
    <AttendanceManagementClient
      initialAttendances={attendances}
      initialDate={selectedDate}
      initialAlerts={initialAlerts}
    />
  );
}

