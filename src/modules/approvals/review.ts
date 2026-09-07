/**
 * `GET /api/v1/approvals/:postId` — API.md: "review payload: post, version
 * under review, previous version, diff, history, SLA, comments." Unlike
 * the queue, this endpoint's authorization genuinely is `checkApprovalRead`'s
 * resource-scoped check (AUTHENTICATION.md §5): a department peer or a
 * `POST_READ_ALL` holder can read the review, but only the actual
 * assignee can decide — `capabilities.canDecide` is `can(authz,
 * "POST_APPROVE", ...)` against the narrower `approval-action` policy,
 * reused rather than re-derived.
 *
 * API.md's payload names one "diff" (singular) — previous version to the
 * version under review — not an arbitrary-pair selector; that richer
 * comparison already exists for the post's own creator at
 * `/api/v1/posts/:id/versions/compare`, scoped to `POST_READ_OWN`, which
 * an approver never holds for someone else's post. Rather than reopen
 * that endpoint's Phase 10 authorization (a real, broader "read policy"
 * gap noted here, not fixed — see IMPLEMENTATION_PLAN.md), the review
 * screen ships the one diff API.md actually documents.
 */
import type { Priority, PostStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import {
  can,
  type AuthorizedUser,
  type PolicyResource,
} from "@/modules/authorization";
import {
  listVersions,
  getVersion,
  compareVersions,
  getActivity,
} from "@/modules/posts";
import type {
  VersionDetailDto,
  VersionCompareDto,
  ActivityEntryDto,
} from "@/modules/posts";
import { getApprovalQueue, type QueueFilters } from "./queue";

export interface ApprovalReviewHeader {
  postId: string;
  reference: string;
  title: string;
  status: PostStatus;
  priority: Priority;
  currentVersionId: string;
  currentVersionNumber: number;
  lockVersion: number;
  creatorName: string;
  departmentName: string | null;
  submittedAt: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  warningAt: string | null;
  /** null until a real `assignedAt` and `dueAt` both exist (Phase 19). */
  slaPercentElapsed: number | null;
  waitingHours: number | null;
  capabilities: { canDecide: boolean; reason: string | null };
}

export interface ApprovalReviewDto {
  header: ApprovalReviewHeader;
  currentVersion: VersionDetailDto;
  diff: VersionCompareDto | null;
  history: ActivityEntryDto[];
}

/** The `PolicyResource` `GET /:postId`'s `loadResource` needs — `checkApprovalRead`'s own contract. */
export async function loadApprovalReadResource(postId: string): Promise<{
  resource: { postId: string };
  policyResource: PolicyResource;
} | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { departmentId: true },
  });
  if (!post) return null;

  const assignment = await prisma.approvalAssignment.findFirst({
    where: { postId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    select: { assigneeUserId: true, assigneeGroupId: true },
  });

  return {
    resource: { postId },
    policyResource: {
      kind: "approval-read",
      postDepartmentId: post.departmentId,
      assignment,
    },
  };
}

export async function getApprovalReviewPayload(
  postId: string,
  authz: AuthorizedUser,
): Promise<ApprovalReviewDto | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      creator: { select: { displayName: true } },
      department: { select: { name: true } },
      currentVersion: { select: { id: true, versionNumber: true } },
    },
  });
  if (!post || !post.currentVersion) return null;

  const assignment = await prisma.approvalAssignment.findFirst({
    where: { postId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    select: {
      assigneeUserId: true,
      assigneeGroupId: true,
      assignedAt: true,
      dueAt: true,
      warningAt: true,
      postVersionId: true,
      status: true,
      assigneeUser: { select: { displayName: true } },
      assigneeGroup: { select: { name: true } },
    },
  });

  const now = new Date();
  let slaPercentElapsed: number | null = null;
  let waitingHours: number | null = null;
  if (assignment) {
    waitingHours = Math.round(
      (now.getTime() - assignment.assignedAt.getTime()) / 3_600_000,
    );
    if (assignment.dueAt) {
      const total =
        assignment.dueAt.getTime() - assignment.assignedAt.getTime();
      const elapsed = now.getTime() - assignment.assignedAt.getTime();
      slaPercentElapsed =
        total > 0 ? Math.round((elapsed / total) * 100) : null;
    }
  }

  const canDecide =
    !!assignment &&
    can(authz, "POST_APPROVE", {
      kind: "approval-action",
      postCreatorId: post.creatorId,
      postVersionId: post.currentVersion.id,
      assignment: {
        assigneeUserId: assignment.assigneeUserId,
        assigneeGroupId: assignment.assigneeGroupId,
        postVersionId: assignment.postVersionId,
        status: assignment.status,
      },
    });

  // UI_UX_SPEC.md §5: "Buttons are disabled with an explanatory tooltip
  // when the viewer is not the assignee, is the creator, or the post has
  // already been decided" — computed once here so the client never has
  // to reverse-engineer which of the three applies from partial data.
  let cannotDecideReason: string | null = null;
  if (!canDecide) {
    if (post.creatorId === authz.id) {
      cannotDecideReason = "You created this post.";
    } else if (post.status !== "IN_REVIEW") {
      cannotDecideReason = "This post has already been decided.";
    } else {
      cannotDecideReason = "You are not the assigned approver.";
    }
  }

  const currentVersionId = post.currentVersion.id;
  const currentVersionNumber = post.currentVersion.versionNumber;

  const [versions, currentVersion, history] = await Promise.all([
    listVersions(postId),
    getVersion(postId, currentVersionId),
    getActivity(postId),
  ]);

  const previousVersion = versions.find(
    (v) => v.versionNumber === currentVersionNumber - 1,
  );
  const diff = previousVersion
    ? await compareVersions(postId, previousVersion.id, currentVersionId)
    : null;

  return {
    header: {
      postId: post.id,
      reference: post.reference,
      title: post.title,
      status: post.status,
      priority: post.priority,
      currentVersionId: post.currentVersion.id,
      currentVersionNumber: post.currentVersion.versionNumber,
      lockVersion: post.lockVersion,
      creatorName: post.creator.displayName,
      departmentName: post.department?.name ?? null,
      submittedAt: post.submittedAt?.toISOString() ?? null,
      assigneeName:
        assignment?.assigneeUser?.displayName ??
        assignment?.assigneeGroup?.name ??
        null,
      dueAt: assignment?.dueAt?.toISOString() ?? null,
      warningAt: assignment?.warningAt?.toISOString() ?? null,
      slaPercentElapsed,
      waitingHours,
      capabilities: { canDecide, reason: cannotDecideReason },
    },
    currentVersion,
    diff,
    history: history.filter((entry) => entry.type === "ACTION"),
  };
}

/** `GET /next?after=:postId` — the next item in the caller's own queue, keyboard-nav flow. */
export async function getNextInQueue(
  authz: AuthorizedUser,
  afterPostId: string,
  filters: QueueFilters = {},
): Promise<{ postId: string } | null> {
  const page = await getApprovalQueue(authz, { ...filters, pageSize: 100 });
  const index = page.items.findIndex((item) => item.postId === afterPostId);
  if (index === -1 || index + 1 >= page.items.length) return null;
  return { postId: page.items[index + 1].postId };
}
