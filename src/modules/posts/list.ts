/**
 * "My Posts" — UI_UX_SPEC.md §6, API.md's `GET /api/v1/posts` ("scoped
 * list; tabs map to `status` filters"). Always scoped to the requesting
 * user's own `creatorId` — a broader `POST_READ_ALL` grant is for other
 * screens (the approval queue's admin visibility), not this one.
 */
import type { Priority, PostStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type PostListTab =
  | "all"
  | "drafts"
  | "pending"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "archived";

const TAB_STATUSES: Partial<Record<PostListTab, PostStatus[]>> = {
  drafts: ["DRAFT"],
  pending: ["SUBMITTED", "IN_REVIEW"],
  changes_requested: ["CHANGES_REQUESTED"],
  approved: ["APPROVED"],
  rejected: ["REJECTED"],
  archived: ["ARCHIVED"],
};

export interface PostListFilters {
  tab: PostListTab;
  search?: string;
  priority?: Priority;
  departmentId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PostListRow {
  id: string;
  reference: string;
  title: string;
  status: PostStatus;
  priority: Priority;
  versionNumber: number | null;
  submittedAt: string | null;
  approverName: string | null;
  slaPercentElapsed: number | null;
  updatedAt: string;
  lockVersion: number;
}

/** Cap for this client-side-table screen — same reasoning as the approval queue's own `pageSize=100`. */
const MAX_ROWS = 200;

const OPEN_ASSIGNMENT_STATUSES = new Set(["PENDING", "IN_PROGRESS"]);

async function matchingSearchIds(
  userId: string,
  search: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Post"
    WHERE "creatorId" = ${userId}::uuid
      AND "deletedAt" IS NULL
      AND "searchVector" @@ plainto_tsquery('english', ${search})
  `;
  return rows.map((r) => r.id);
}

export async function listPosts(
  userId: string,
  filters: PostListFilters,
): Promise<PostListRow[]> {
  let searchIds: string[] | undefined;
  if (filters.search?.trim()) {
    searchIds = await matchingSearchIds(userId, filters.search.trim());
    if (searchIds.length === 0) return [];
  }

  const statuses =
    filters.tab === "all" ? undefined : TAB_STATUSES[filters.tab];

  const posts = await prisma.post.findMany({
    where: {
      creatorId: userId,
      deletedAt: null,
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(searchIds ? { id: { in: searchIds } } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            updatedAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_ROWS,
    select: {
      id: true,
      reference: true,
      title: true,
      draftTitle: true,
      status: true,
      priority: true,
      submittedAt: true,
      updatedAt: true,
      lockVersion: true,
      currentVersion: { select: { versionNumber: true } },
      assignments: {
        orderBy: { assignedAt: "desc" },
        take: 1,
        select: {
          dueAt: true,
          assignedAt: true,
          status: true,
          assigneeUser: { select: { displayName: true } },
          assigneeGroup: { select: { name: true } },
        },
      },
    },
  });

  const now = Date.now();
  return posts.map((post) => {
    const assignment = post.assignments[0];
    let slaPercentElapsed: number | null = null;
    if (assignment?.dueAt && OPEN_ASSIGNMENT_STATUSES.has(assignment.status)) {
      const total =
        assignment.dueAt.getTime() - assignment.assignedAt.getTime();
      const elapsed = now - assignment.assignedAt.getTime();
      slaPercentElapsed =
        total > 0 ? Math.round((elapsed / total) * 100) : null;
    }
    return {
      id: post.id,
      reference: post.reference,
      // The in-progress working title, same fallback submit.ts uses —
      // `title` itself only reflects what a past submit last finalized.
      title: post.draftTitle ?? post.title,
      status: post.status,
      priority: post.priority,
      versionNumber: post.currentVersion?.versionNumber ?? null,
      submittedAt: post.submittedAt?.toISOString() ?? null,
      approverName:
        assignment?.assigneeUser?.displayName ??
        assignment?.assigneeGroup?.name ??
        null,
      slaPercentElapsed,
      updatedAt: post.updatedAt.toISOString(),
      lockVersion: post.lockVersion,
    };
  });
}
