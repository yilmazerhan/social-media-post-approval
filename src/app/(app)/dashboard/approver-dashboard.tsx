import { AlertOctagon, AlertTriangle, CheckCircle2, Inbox } from "lucide-react";
import { getApproverDashboard } from "@/modules/approvals";
import type { AuthorizedUser } from "@/modules/authorization";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** UI_UX_SPEC.md §6's approver dashboard: queue counts and an SLA compliance summary. */
export async function ApproverDashboard({ user }: { user: AuthorizedUser }) {
  const { counts, slaCompliance } = await getApproverDashboard(user);

  return (
    <div>
      <PageHeader title="Dashboard" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Pending approvals"
          value={counts.pending}
          icon={Inbox}
          href="/approvals"
        />
        <StatCard
          label="Due soon"
          value={counts.dueSoon}
          icon={AlertTriangle}
          tone={counts.dueSoon > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Overdue"
          value={counts.overdue}
          icon={AlertOctagon}
          href="/approvals?filter=overdue"
          tone={counts.overdue > 0 ? "destructive" : "default"}
        />
        <StatCard
          label="Recently completed"
          value={counts.recentlyCompleted}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>SLA compliance (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {slaCompliance.compliancePercent === null ? (
            <p className="text-muted-foreground text-sm">
              No decisions with a due date in the last 30 days yet.
            </p>
          ) : (
            <p className="text-sm">
              <span className="text-2xl font-semibold">
                {slaCompliance.compliancePercent}%
              </span>{" "}
              <span className="text-muted-foreground">
                on time ({slaCompliance.onTime} of {slaCompliance.decided}{" "}
                decisions)
              </span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
