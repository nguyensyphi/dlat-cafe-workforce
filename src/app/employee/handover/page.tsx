import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerSession } from "@/lib/auth";
import { todayDateStringVN, formatTimeVN } from "@/lib/date";
import { ShiftHandoverWizard } from "@/components/employee/shift-handover-wizard";
import { Button } from "@/components/ui/button";
import {
  DLAT_DAILY_CHECKLIST_SETTING_KEY,
  getChecklistForShift,
  resolveShiftCodeFromShift,
  type DailyChecklistTemplateItem,
  type DlatShiftCode,
} from "@/modules/handover/dlat-daily-checklist";

export const dynamic = "force-dynamic";

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

  // Find active assigned shifts for today (ordered chronologically)
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      employeeId: employee.id,
      status: "ASSIGNED",
      shift: {
        workDate: todayDate,
        status: { not: "CANCELLED" },
      },
    },
    include: {
      shift: {
        include: {
          template: true,
          handovers: {
            select: {
              id: true,
              status: true,
              submittedAt: true,
              handoverEmployee: { select: { fullName: true } },
            },
            orderBy: { submittedAt: "desc" },
          },
        },
      },
    },
    orderBy: { shift: { startAt: "asc" } },
  });

  // Check if employee has an active open attendance record today (clocked in, not yet clocked out)
  const openAttendance = await prisma.attendance.findFirst({
    where: {
      employeeId: employee.id,
      workDate: todayDate,
      clockIn: { not: null },
      clockOut: null,
      shiftId: { not: null },
    },
    orderBy: { clockIn: "desc" },
    select: { shiftId: true },
  });

  const nowMs = Date.now();
  const activeWindowAssignment = assignments.find((a) => {
    const startMs = a.shift.startAt.getTime() - 30 * 60_000;
    const endMs = a.shift.endAt.getTime() + 120 * 60_000;
    return nowMs >= startMs && nowMs <= endMs;
  });

  // Priority: 1. Open attendance's shift -> 2. Currently active shift window -> 3. First unconfirmed shift -> 4. Last assigned shift
  let targetShift =
    (openAttendance?.shiftId
      ? assignments.find((a) => a.shift.id === openAttendance.shiftId)?.shift
      : undefined) ??
    activeWindowAssignment?.shift ??
    assignments.find(
      (a) => !a.shift.handovers.some((h) => h.status === "CONFIRMED"),
    )?.shift ??
    assignments[assignments.length - 1]?.shift;

  if (!targetShift) {
    const fallback = await prisma.shift.findFirst({
      where: { workDate: todayDate, status: { not: "CANCELLED" } },
      include: {
        template: true,
        handovers: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            handoverEmployee: { select: { fullName: true } },
          },
          orderBy: { submittedAt: "desc" },
        },
      },
      orderBy: { startAt: "asc" },
    });
    if (fallback) {
      targetShift = fallback;
    }
  }

  const currentTimeVN = formatTimeVN(new Date());
  const currentHourVN = Number(currentTimeVN.split(":")[0] ?? 7);
  const fallbackMeta: { code: DlatShiftCode; name: string; startTime: string; endTime: string } =
    currentHourVN < 11
      ? { code: "CA_1", name: "Ca 1 (07:00–11:00)", startTime: "07:00", endTime: "11:00" }
      : currentHourVN < 15
      ? { code: "CA_2", name: "Ca 2 (11:00–15:00)", startTime: "11:00", endTime: "15:00" }
      : currentHourVN < 19
      ? { code: "CA_3", name: "Ca 3 (15:00–19:00)", startTime: "15:00", endTime: "19:00" }
      : { code: "CA_4", name: "Ca 4 (19:00–23:00)", startTime: "19:00", endTime: "23:00" };

  const shiftData = targetShift
    ? {
        id: targetShift.id,
        workDate: todayStr,
        name: targetShift.name,
        startTime: targetShift.template?.startTime ?? formatTimeVN(targetShift.startAt),
        endTime: targetShift.template?.endTime ?? formatTimeVN(targetShift.endAt),
        templateCode: targetShift.template?.code ?? null,
      }
    : {
        id: "shift-today-fallback",
        workDate: todayStr,
        name: fallbackMeta.name,
        startTime: fallbackMeta.startTime,
        endTime: fallbackMeta.endTime,
        templateCode: fallbackMeta.code,
      };

  // Fetch previous shift's closing cash handover so Nhận TM (opening cash) pre-fills accurately
  const previousHandover = await prisma.shiftHandover.findFirst({
    where: targetShift
      ? {
          shift: {
            startAt: { lt: targetShift.startAt },
          },
        }
      : undefined,
    orderBy: { submittedAt: "desc" },
    select: { actualClosingCashVnd: true },
  });
  const previousClosingCashVnd = previousHandover
    ? Number(previousHandover.actualClosingCashVnd)
    : null;

  // Load locally saved D'Lat checklist templates from SystemSetting if customized
  const checklistSetting = await prisma.systemSetting.findUnique({
    where: { key: DLAT_DAILY_CHECKLIST_SETTING_KEY },
    select: { value: true },
  });
  const customTemplates =
    (checklistSetting?.value as Partial<Record<DlatShiftCode, DailyChecklistTemplateItem[]>> | null) ??
    null;

  const shiftCode = resolveShiftCodeFromShift(
    shiftData.name,
    shiftData.templateCode,
    shiftData.startTime,
  );
  const initialChecklist = getChecklistForShift(
    shiftCode,
    todayStr,
    customTemplates,
  );

  // Find colleagues who can receive handover
  const colleagues = await prisma.employee.findMany({
    where: {
      id: { not: employee.id },
      status: "ACTIVE",
    },
    select: { id: true, fullName: true, employeeCode: true },
    orderBy: { fullName: "asc" },
  });

  const existingSubmittedHandover = targetShift?.handovers.find((h) =>
    ["SUBMITTED", "DISCREPANCY", "CONFIRMED"].includes(h.status),
  );

  return (
    <div className="py-6 px-4">
      <div className="max-w-3xl mx-auto mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Biên bản Bàn giao ca & Checklist Daily</h1>
        <p className="text-sm text-muted-foreground">
          Tick hoàn thành Checklist công việc ca ({shiftCode.replace("_", " ")}) & chốt quỹ tiền mặt trước khi chấm ra
        </p>
      </div>
      {existingSubmittedHandover && (
        <div
          data-testid="shared-handover-submitted-banner"
          className="max-w-3xl mx-auto mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div>
            <p className="font-semibold text-emerald-900">
              Biên bản bàn giao chung của ca này đã được nộp bởi{" "}
              {existingSubmittedHandover.handoverEmployee.fullName}
              {existingSubmittedHandover.submittedAt
                ? ` lúc ${formatTimeVN(existingSubmittedHandover.submittedAt)}`
                : ""}
              .
            </p>
            <p className="text-xs text-emerald-800 mt-1">
              Tất cả nhân viên trong ca đã được mở khóa quét mã QR Tan ca. Bạn không cần nộp trùng trừ khi cần cập nhật lại.
            </p>
          </div>
          <Link href="/employee/attendance">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap min-h-[44px]">
              Quay lại Quét QR Tan ca
            </Button>
          </Link>
        </div>
      )}
      <ShiftHandoverWizard
        shift={shiftData}
        currentEmployee={employee}
        colleagues={colleagues}
        initialChecklist={initialChecklist}
        customTemplates={customTemplates}
        previousClosingCashVnd={previousClosingCashVnd}
      />
    </div>
  );
}
