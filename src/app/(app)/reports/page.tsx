import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Reports — Content Approval" };

export default function ReportsPage() {
  return (
    <ComingSoon
      title="Reports"
      breadcrumbs={[{ label: "Reports" }]}
      phaseNote="Report cards, charts and CSV export arrive in Phase 22."
    />
  );
}
