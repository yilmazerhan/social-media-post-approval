import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Dashboard — Content Approval" };

/** A minimal placeholder — the real role-aware dashboard (stat cards, activity, SLA summary) is Phase 7. */
export default function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard" />
      <p className="text-muted-foreground text-sm">
        Welcome back. The full dashboard (stat cards, recent activity, SLA
        summary) is built out in Phase 7 — see IMPLEMENTATION_PLAN.md.
      </p>
    </div>
  );
}
