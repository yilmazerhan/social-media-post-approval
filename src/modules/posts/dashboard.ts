/**
 * Read-only aggregates for the employee dashboard and the admin content
 * volume tile — UI_UX_SPEC.md §6. Nothing here mutates state, so these
 * skip the full request lifecycle (ARCHITECTURE.md §3) and are called
 * directly from the dashboard Server Components, the same way
 * `authorization.loadAuthorizedUser` already is.
 */
import type { ApprovalActionType, PostStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export interface EmployeePostCounts {
  drafts: number;
  pendingApproval: number;
  changesRequested: number;
  approved: number;
  rejected: number;
}

export interface PostActivityEntry {
  id: string;
  postId: string;
  postTitle: string;
  action: ApprovalActionType;
  actorName: string;
  createdAt: Date;
}

export interface EmployeeDashboard {
  counts: EmployeePostCounts;
  recentActivity: PostActivityEntry[];
  hasAnyPosts: boolean;
}

const PENDING_APPROVAL_STATUSES: PostStatus[] = ["SUBMITTED", "IN_REVIEW"];

/** UI_UX_SPEC.md §6's employee stat cards, scoped to the caller's own posts. */
export async function getEmployeeDashboard(
  userId: string,
): Promise<EmployeeDashboard> {
  const [statusCounts, totalCount, activity] = await Promise.all([
    prisma.post.groupBy({
      by: ["status"],
      where: { creatorId: userId, deletedAt: null },
      _count: true,
    }),
    prisma.post.count({ where: { creatorId: userId, deletedAt: null } }),
    prisma.approvalAction.findMany({
      where: { post: { creatorId: userId } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        postId: true,
        action: true,
        createdAt: true,
        post: { select: { title: true } },
        actor: { select: { displayName: true } },
      },
    }),
  ]);

  const byStatus = new Map(statusCounts.map((row) => [row.status, row._count]));
  const countPendingApproval = PENDING_APPROVAL_STATUSES.reduce(
    (sum, status) => sum + (byStatus.get(status) ?? 0),
    0,
  );

  return {
    counts: {
      drafts: byStatus.get("DRAFT") ?? 0,
      pendingApproval: countPendingApproval,
      changesRequested: byStatus.get("CHANGES_REQUESTED") ?? 0,
      approved: byStatus.get("APPROVED") ?? 0,
      rejected: byStatus.get("REJECTED") ?? 0,
    },
    recentActivity: activity.map((row) => ({
      id: row.id,
      postId: row.postId,
      postTitle: row.post.title,
      action: row.action,
      actorName: row.actor.displayName,
      createdAt: row.createdAt,
    })),
    hasAnyPosts: totalCount > 0,
  };
}

export interface ContentVolumePoint {
  /** ISO date (`YYYY-MM-DD`), oldest first. */
  date: string;
  count: number;
}

/**
 * Posts submitted per day over the trailing window — the admin dashboard's
 * "content volume over time" tile. Bucketed in JS rather than with a raw
 * SQL date_trunc: at this data scale (an internal tool, one query per
 * dashboard view) the simplicity is worth more than the query-level
 * aggregation.
 */
export async function getContentVolumeSeries(
  days = 14,
): Promise<ContentVolumePoint[]> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const versions = await prisma.postVersion.findMany({
    where: { submittedAt: { gte: start } },
    select: { submittedAt: true },
  });

  const counts = new Map<string, number>();
  for (const version of versions) {
    if (!version.submittedAt) continue;
    const key = version.submittedAt.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: days }, (_, i) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    return { date: key, count: counts.get(key) ?? 0 };
  });
}
