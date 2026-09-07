import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { loadAuthorizedUser } from "@/modules/authorization";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { ReportsView } from "./reports-view";

export const metadata: Metadata = { title: "Reports — Content Approval" };

export default async function ReportsPage() {
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) redirect("/login");

  // API.md gates every report endpoint on REPORT_READ regardless — this
  // just avoids showing a screen that can never load anything for its user,
  // the same pattern `/approvals` uses.
  const authz = await loadAuthorizedUser(sessionContext.user.id);
  if (!authz.permissions.has("REPORT_READ")) redirect("/dashboard");

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Reports" breadcrumbs={[{ label: "Reports" }]} />
      <ReportsView departments={departments} />
    </div>
  );
}
