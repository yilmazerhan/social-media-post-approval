import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { loadAuthorizedUser } from "@/modules/authorization";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { ApprovalQueueView } from "@/components/app/approvals/approval-queue-view";

export const metadata: Metadata = { title: "Approvals — Content Approval" };

export default async function ApprovalsPage() {
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) redirect("/login");

  // Mirrors the sidebar's own visibility rule (Phase 6) — the API itself
  // enforces `APPROVAL_READ` regardless, this just avoids showing a
  // screen that can never load anything for its user.
  const authz = await loadAuthorizedUser(sessionContext.user.id);
  if (!authz.permissions.has("APPROVAL_READ")) redirect("/dashboard");

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Approvals" breadcrumbs={[{ label: "Approvals" }]} />
      <ApprovalQueueView departments={departments} />
    </div>
  );
}
