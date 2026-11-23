import { requireServerSession } from "@/lib/auth";
import { leaveService } from "@/modules/leaves/leave.service";
import { swapService } from "@/modules/swaps/swap.service";
import { RequestsManagementClient } from "@/components/requests/requests-management-client";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const actor = await requireServerSession("requests:review");

  const [leaves, swaps] = await Promise.all([
    leaveService.listLeaveRequests(actor),
    swapService.listSwaps(actor),
  ]);

  return <RequestsManagementClient leaves={leaves} swaps={swaps} />;
}

