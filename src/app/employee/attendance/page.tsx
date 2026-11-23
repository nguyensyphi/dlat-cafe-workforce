import { requireServerSession } from "@/lib/auth";
import { attendanceService } from "@/modules/attendance/attendance.service";
import { EmployeeAttendanceClient } from "@/components/employee/employee-attendance-client";

export default async function EmployeeAttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string; handoverSuccess?: string }>;
}) {
  const actor = await requireServerSession("self:attendance");
  const params = searchParams ? await searchParams : {};

  const [todayStatus, history] = await Promise.all([
    attendanceService.getMyTodayStatus(actor),
    attendanceService.getMyAttendances(actor),
  ]);

  return (
    <div className="space-y-4">
      {params.handoverSuccess === "true" && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900">
            <strong>Đã nộp biên bản bàn giao ca thành công!</strong> Vui lòng quét mã QR tại quầy để hoàn tất <strong>Chấm ra (Tan ca)</strong>.
          </div>
        </div>
      )}
      <EmployeeAttendanceClient
        initialTodayStatus={todayStatus}
        history={history}
        urlToken={params.token}
      />
    </div>
  );
}
