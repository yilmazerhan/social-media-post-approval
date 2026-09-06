import Link from "next/link";
import {
  CheckCircle2,
  FilePlus2,
  PencilLine,
  Send,
  Undo2,
  XCircle,
} from "lucide-react";
import { getEmployeeDashboard } from "@/modules/posts";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ActivityItem } from "@/components/app/activity-item";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

/** UI_UX_SPEC.md §6's employee dashboard: my post counts, recent activity, a create action. */
export async function EmployeeDashboard({ userId }: { userId: string }) {
  const { counts, recentActivity, hasAnyPosts } =
    await getEmployeeDashboard(userId);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        actions={
          <Button asChild>
            <Link href="/posts/new">Create post</Link>
          </Button>
        }
      />

      {!hasAnyPosts ? (
        <EmptyState
          icon={FilePlus2}
          title="No posts yet — create your first post to send it for approval."
          action={
            <Button asChild>
              <Link href="/posts/new">Create post</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Drafts"
              value={counts.drafts}
              icon={PencilLine}
              href="/posts?status=DRAFT"
            />
            <StatCard
              label="Pending approval"
              value={counts.pendingApproval}
              icon={Send}
              href="/posts?status=SUBMITTED"
            />
            <StatCard
              label="Changes requested"
              value={counts.changesRequested}
              icon={Undo2}
              href="/posts?status=CHANGES_REQUESTED"
              tone={counts.changesRequested > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Approved"
              value={counts.approved}
              icon={CheckCircle2}
              href="/posts?status=APPROVED"
              tone="success"
            />
            <StatCard
              label="Rejected"
              value={counts.rejected}
              icon={XCircle}
              href="/posts?status=REJECTED"
              tone={counts.rejected > 0 ? "destructive" : "default"}
            />
          </div>

          <div className="mt-8">
            <h2 className="mb-2 text-lg font-semibold">Recent activity</h2>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing has happened on your posts yet.
              </p>
            ) : (
              <ul className="divide-y">
                {recentActivity.map((entry) => (
                  <ActivityItem
                    key={entry.id}
                    actorName={entry.actorName}
                    action={entry.action}
                    postTitle={entry.postTitle}
                    postHref={`/posts/${entry.postId}`}
                    createdAt={entry.createdAt}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
