import { requireServerSession } from "@/lib/auth";
import { todayDateStringVN } from "@/lib/date";
import { handoverService } from "@/modules/handover/handover.service";
import { HandoverManagementClient, type HandoverRecord } from "@/components/handover/handover-management-client";

export default async function HandoversPage() {
  const actor = await requireServerSession("attendance:manage");
  const todayStr = todayDateStringVN();

  const rawHandovers = await handoverService.listHandovers({}, actor);

  const handovers: HandoverRecord[] = rawHandovers.map((h) => ({
    id: h.id,
    shiftId: h.shiftId,
    shiftName: h.shift?.name ?? "Ca làm việc",
    workDate: h.shift?.workDate ? h.shift.workDate.toISOString().substring(0, 10) : todayStr,
    status: h.status as HandoverRecord["status"],
    handoverEmployeeName: h.handoverEmployee?.fullName ?? "—",
    receivingEmployeeName: h.receivingEmployee?.fullName ?? null,
    openingCashVnd: Number(h.openingCashVnd),
    cashSalesVnd: Number(h.cashSalesVnd),
    cashExpensesVnd: Number(h.cashExpensesVnd),
    expectedClosingCashVnd: Number(h.expectedClosingCashVnd),
    actualClosingCashVnd: Number(h.actualClosingCashVnd),
    cashDifferenceVnd: Number(h.cashDifferenceVnd),
    cashDiscrepancyReason: h.cashDiscrepancyReason,
    stockReport: h.stockReport,
    equipmentReport: h.equipmentReport,
    cleanlinessReport: h.cleanlinessReport,
    customerNotes: h.customerNotes,
    pendingTasks: (h.pendingTasks as string[]) ?? [],
    handoverNotes: h.handoverNotes,
    reviewNotes: h.reviewNotes,
    submittedAt: h.submittedAt ? h.submittedAt.toISOString() : null,
    confirmedAt: h.confirmedAt ? h.confirmedAt.toISOString() : null,
  }));

  return (
    <HandoverManagementClient
      initialHandovers={handovers}
      initialDate={todayStr}
    />
  );
}

