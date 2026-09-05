import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Approvals — Content Approval" };

export default function ApprovalsPage() {
  return (
    <ComingSoon
      title="Approvals"
      breadcrumbs={[{ label: "Approvals" }]}
      phaseNote="The approval queue arrives in Phase 13, once the workflow and assignment modules exist (Phase 11/12)."
    />
  );
}
