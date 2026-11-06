import { requireServerSession } from "@/lib/auth";
import { todayDateStringVN } from "@/lib/date";
import { attendanceService } from "@/modules/attendance/attendance.service";
import { AttendanceManagementClient } from "@/components/attendance/attendance-management-client";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireServerSession("attendance:manage");
  const params = await searchParams;
  const selectedDate = params.date || todayDateStringVN();

  const attendances = await attendanceService.listAttendances(actor, {
    workDate: selectedDate,
  });

  return (
    <AttendanceManagementClient
      initialAttendances={attendances}
      initialDate={selectedDate}
    />
  );
}

