/**
 * `GET /api/v1/approvals/queue` — API.md: "my queue: filters `dueSoon`,
 * `overdue`, priority, department." Strictly personal — scoped to
 * assignments routed to this user directly or via their groups
 * (`assignedToMeFilter`, shared with the dashboard aggregates), never
 * widened by `POST_READ_ALL` — that permission governs reading one post's
 * full detail, not "my queue," which is "my" by definition.
 *
 * The four UI_UX_SPEC.md §6 quick filters (Overdue / Due today / Unassigned
 * / My group) map onto real, already-existing columns: `dueAt` for the
 * first two, `assigneeUserId IS NULL` for a group assignment nobody has
 * personally picked up yet ("Unassigned"), and `assigneeGroupId` narrowed
 * to the caller's own groups for "My group" (a subset of "my queue," which
 * otherwise mixes direct and group assignments). `dueAt`/`warningAt` are
 * always `null` until Phase 19 computes them — `overdue`/`dueSoon`/`dueToday`
 * are real, correct queries against columns nothing populates yet, not
 * faked data.
 */
import type {
  AssignmentStatus,
  Priority,
  PostStatus,
  Prisma,
} from "@/generated/prisma/client";
import type { AuthorizedUser } from "@/modules/authorization";
import { prisma } from "@/server/db";
import { assignedToMeFilter } from "./dashboard";

const OPEN_STATUSES: AssignmentStatus[] = ["PENDING", "IN_PROGRESS"];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface QueueFilters {
  dueSoon?: boolean;
  overdue?: boolean;
  dueToday?: boolean;
  unassigned?: boolean;
  myGroupOnly?: boolean;
  priority?: Priority;
  departmentId?: string;
  page?: number;
  pageSize?: number;
}

export interface QueueRow {
  postId: string;
  reference: string;
  title: string;
  priority: Priority;
  departmentName: string | null;
  status: PostStatus;
  versionNumber: number;
  assigneeKind: "USER" | "GROUP";
  submittedAt: string | null;
  dueAt: string | null;
  warningAt: string | null;
}

export interface QueuePage {
  items: QueueRow[];
  page: number;
  pageSize: number;
  total: number;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function getApprovalQueue(
  user: AuthorizedUser,
  filters: QueueFilters,
): Promise<QueuePage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  const now = new Date();

  const scope = filters.myGroupOnly
    ? { assigneeGroupId: { in: Array.from(user.groupIds) } }
    : assignedToMeFilter(user);

  const conditions: Prisma.ApprovalAssignmentWhereInput[] = [
    scope,
    { status: { in: OPEN_STATUSES } },
  ];
  if (filters.overdue) conditions.push({ dueAt: { lte: now } });
  if (filters.dueSoon) {
    conditions.push({ warningAt: { lte: now } });
    conditions.push({ OR: [{ dueAt: null }, { dueAt: { gt: now } }] });
  }
  if (filters.dueToday) {
    conditions.push({ dueAt: { gte: startOfDay(now), lte: endOfDay(now) } });
  }
  if (filters.unassigned) conditions.push({ assigneeUserId: null });
  if (filters.priority || filters.departmentId) {
    conditions.push({
      post: {
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      },
    });
  }

  const where: Prisma.ApprovalAssignmentWhereInput = { AND: conditions };

  const [rows, total] = await Promise.all([
    prisma.approvalAssignment.findMany({
      where,
      orderBy: [
        { dueAt: { sort: "asc", nulls: "last" } },
        { assignedAt: "asc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        postId: true,
        dueAt: true,
        warningAt: true,
        assigneeUserId: true,
        post: {
          select: {
            reference: true,
            title: true,
            priority: true,
            status: true,
            submittedAt: true,
            department: { select: { name: true } },
          },
        },
        postVersion: { select: { versionNumber: true } },
      },
    }),
    prisma.approvalAssignment.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      postId: r.postId,
      reference: r.post.reference,
      title: r.post.title,
      priority: r.post.priority,
      departmentName: r.post.department?.name ?? null,
      status: r.post.status,
      versionNumber: r.postVersion.versionNumber,
      assigneeKind: r.assigneeUserId ? ("USER" as const) : ("GROUP" as const),
      submittedAt: r.post.submittedAt?.toISOString() ?? null,
      dueAt: r.dueAt?.toISOString() ?? null,
      warningAt: r.warningAt?.toISOString() ?? null,
    })),
    page,
    pageSize,
    total,
  };
}
