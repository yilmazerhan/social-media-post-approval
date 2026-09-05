import { AlertOctagon, Clock, Inbox, UserCheck, Users } from "lucide-react";
import { getUserStats } from "@/modules/users";
import { getContentVolumeSeries } from "@/modules/posts";
import { getSystemApprovalStats } from "@/modules/approvals";
import { getSystemHealth } from "@/server/health";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { HealthTile } from "@/components/app/health-tile";
import { ContentVolumeSparkline } from "@/components/app/content-volume-sparkline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

/** UI_UX_SPEC.md §6's admin dashboard: system-wide counts, content volume, and health tiles. */
export async function AdminDashboard() {
  const [userStats, contentVolume, approvalStats, health] = await Promise.all([
    getUserStats(),
    getContentVolumeSeries(),
    getSystemApprovalStats(),
    getSystemHealth(),
  ]);

  return (
    <div>
      <PageHeader title="Dashboard" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total users" value={userStats.total} icon={Users} />
        <StatCard
          label="Active users"
          value={userStats.active}
          icon={UserCheck}
        />
        <StatCard
          label="Pending approvals"
          value={approvalStats.pending}
          icon={Inbox}
        />
        <StatCard
          label="Overdue approvals"
          value={approvalStats.overdue}
          icon={AlertOctagon}
          tone={approvalStats.overdue > 0 ? "destructive" : "default"}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Content volume (last 14 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ContentVolumeSparkline points={contentVolume} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Average approval time (last 30 days)</CardTitle>
            <Clock className="text-muted-foreground size-4" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {approvalStats.avgApprovalMinutes === null
                ? "—"
                : formatMinutes(approvalStats.avgApprovalMinutes)}
            </p>
            {approvalStats.avgApprovalMinutes === null && (
              <p className="text-muted-foreground text-sm">
                No decisions in the last 30 days yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">System health</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {health.map((tile) => (
            <HealthTile
              key={tile.key}
              label={tile.label}
              status={tile.status}
              detail={tile.detail}
              href="/admin"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
