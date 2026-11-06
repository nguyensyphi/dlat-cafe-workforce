import { requireServerSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";
import { KioskClient } from "@/components/attendance/kiosk-client";

export default async function AttendanceKioskPage() {
  const actor = await requireServerSession("attendance:manage");
  const initialToken = await attendanceService.generateKioskToken(actor);

  return <KioskClient initialToken={initialToken} />;
}

