import { requireServerSession } from "@/lib/auth";
import { ManagementShell } from "@/components/layout/management-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireServerSession("dashboard:manage");
  return <ManagementShell user={user}>{children}</ManagementShell>;
}

