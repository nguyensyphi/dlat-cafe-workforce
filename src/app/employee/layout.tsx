import { requireServerSession } from "@/lib/auth";
import { EmployeeShell } from "@/components/layout/employee-shell";

export default async function EmployeePortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireServerSession("self:profile");
  return <EmployeeShell user={user}>{children}</EmployeeShell>;
}

