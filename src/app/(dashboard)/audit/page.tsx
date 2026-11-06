import { requireServerSession } from "@/lib/auth";
import { listAuditLogs } from "@/modules/audit/audit.service";
import { AuditLogViewerClient } from "@/components/audit/audit-log-viewer-client";

export default async function AuditLogsPage() {
  await requireServerSession("audit:read");
  const logs = await listAuditLogs({ limit: 100 });

  return <AuditLogViewerClient initialLogs={logs} />;
}

