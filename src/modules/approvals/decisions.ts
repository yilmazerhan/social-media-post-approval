/**
 * The four decision transitions (`START_REVIEW`, `APPROVE`, `REJECT`,
 * `REQUEST_CHANGES`) — ARCHITECTURE.md §4's concurrency rule
 * (`SELECT … FOR UPDATE` on the post row) and CLAUDE.md's "every workflow
 * transition goes through the state machine... there is no second code
 * path," applied the same way `submit.ts` applies it to `SUBMIT`/`RESUBMIT`.
 *
 * Every decision body carries the `postVersionId` the reviewer actually
 * read (API.md §2): if it no longer matches the version awaiting decision,
 * that's `409 ALREADY_DECIDED`, checked after the row lock so a concurrent
 * decision on the same post can only ever leave one of them standing.
 */
import type {
  AssignmentStatus,
  Prisma,
  PostStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import {
  WorkflowError,
  NotFoundError,
  CommentRequiredError,
} from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import { writeNotification } from "@/modules/notifications";
import type { PolicyResource } from "@/modules/authorization";
import { assertLegalTransition } from "./state-machine";

const OPEN_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["PENDING", "IN_PROGRESS"];

export interface ApprovalActionResource {
  status: PostStatus;
  lockVersion: number;
  currentVersionId: string;
}

/** Shared `loadResource` for the four decision routes — the exact shape `checkApprovalAction` needs (AUTHENTICATION.md §5). */
export async function loadApprovalActionResource(postId: string): Promise<{
  resource: ApprovalActionResource;
  policyResource: PolicyResource;
} | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      creatorId: true,
      status: true,
      currentVersionId: true,
      lockVersion: true,
    },
  });
  if (!post || !post.currentVersionId) return null;

  const assignment = await prisma.approvalAssignment.findFirst({
    where: { postId, status: { in: OPEN_ASSIGNMENT_STATUSES } },
    select: {
      postVersionId: true,
      assigneeUserId: true,
      assigneeGroupId: true,
      status: true,
    },
  });

  return {
    resource: {
      status: post.status,
      lockVersion: post.lockVersion,
      currentVersionId: post.currentVersionId,
    },
    policyResource: {
      kind: "approval-action",
      postCreatorId: post.creatorId,
      postVersionId: post.currentVersionId,
      assignment,
    },
  };
}

async function lockPost(tx: Prisma.TransactionClient, postId: string) {
  await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${postId} FOR UPDATE`;
  const post = await tx.post.findUnique({ where: { id: postId } });
  if (!post) throw new NotFoundError();
  return post;
}

function assertLockVersion(post: { lockVersion: number }, lockVersion: number) {
  if (post.lockVersion !== lockVersion) {
    throw new WorkflowError(
      "This post changed elsewhere. Reload and try again.",
      "STALE_RESOURCE",
    );
  }
}

function assertVersionAwaitingDecision(
  post: { currentVersionId: string | null },
  postVersionId: string,
) {
  if (post.currentVersionId !== postVersionId) {
    throw new WorkflowError(
      "This version is no longer awaiting a decision.",
      "ALREADY_DECIDED",
    );
  }
}

async function findOpenAssignment(
  tx: Prisma.TransactionClient,
  postId: string,
  postVersionId: string,
) {
  const assignment = await tx.approvalAssignment.findFirst({
    where: {
      postId,
      postVersionId,
      status: { in: OPEN_ASSIGNMENT_STATUSES },
    },
  });
  if (!assignment) {
    throw new WorkflowError(
      "No open assignment awaits a decision on this post.",
      "INVALID_TRANSITION",
    );
  }
  return assignment;
}

export interface StartReviewResult {
  status: "IN_REVIEW";
  startedAt: string;
}

/** API.md: "`SUBMITTED → IN_REVIEW`; idempotent" — a repeat call while already `IN_REVIEW` under the same open assignment is a no-op success, not `INVALID_TRANSITION`. */
export async function startReview(params: {
  postId: string;
  userId: string;
}): Promise<StartReviewResult> {
  return prisma.$transaction(async (tx) => {
    const post = await lockPost(tx, params.postId);

    const assignment = await tx.approvalAssignment.findFirst({
      where: { postId: post.id, status: { in: OPEN_ASSIGNMENT_STATUSES } },
    });

    if (post.status === "IN_REVIEW" && assignment?.status === "IN_PROGRESS") {
      return {
        status: "IN_REVIEW",
        startedAt: (assignment.startedAt ?? new Date()).toISOString(),
      };
    }

    const nextStatus = assertLegalTransition(post.status, "START_REVIEW");
    if (!assignment) {
      throw new WorkflowError(
        "No open assignment awaits a decision on this post.",
        "INVALID_TRANSITION",
      );
    }

    const now = new Date();
    await tx.post.update({
      where: { id: post.id },
      data: {
        status: nextStatus,
        firstReviewedAt: post.firstReviewedAt ?? now,
        lockVersion: { increment: 1 },
      },
    });
    await tx.approvalAssignment.update({
      where: { id: assignment.id },
      data: { status: "IN_PROGRESS", startedAt: now },
    });
    await tx.approvalAction.create({
      data: {
        postId: post.id,
        postVersionId: assignment.postVersionId,
        assignmentId: assignment.id,
        actorId: params.userId,
        action: "START_REVIEW",
        previousStatus: post.status,
        newStatus: nextStatus,
        createdAt: now,
      },
    });
    await writeAudit(
      {
        actorId: params.userId,
        action: "APPROVAL_STARTED",
        entityType: "Post",
        entityId: post.id,
        postId: post.id,
      },
      tx,
    );

    return { status: "IN_REVIEW", startedAt: now.toISOString() };
  });
}

export interface ApproveResult {
  status: "APPROVED";
  approvedVersion: number;
  approvedBy: { id: string; displayName: string };
  approvedAt: string;
}

export async function approvePost(params: {
  postId: string;
  userId: string;
  input: { postVersionId: string; lockVersion: number; comment?: string };
}): Promise<ApproveResult> {
  return prisma.$transaction(async (tx) => {
    const post = await lockPost(tx, params.postId);
    assertLockVersion(post, params.input.lockVersion);
    assertVersionAwaitingDecision(post, params.input.postVersionId);
    const nextStatus = assertLegalTransition(post.status, "APPROVE");
    const assignment = await findOpenAssignment(
      tx,
      post.id,
      params.input.postVersionId,
    );

    const now = new Date();
    const [version, approver] = await Promise.all([
      tx.postVersion.findUniqueOrThrow({
        where: { id: params.input.postVersionId },
        select: { versionNumber: true },
      }),
      tx.user.findUniqueOrThrow({
        where: { id: params.userId },
        select: { id: true, displayName: true },
      }),
    ]);

    await tx.post.update({
      where: { id: post.id },
      data: {
        status: nextStatus,
        approvedVersionId: params.input.postVersionId,
        decidedAt: now,
        lockVersion: { increment: 1 },
      },
    });
    await tx.approvalAssignment.update({
      where: { id: assignment.id },
      data: { status: "COMPLETED", completedAt: now },
    });
    await tx.approvalAction.create({
      data: {
        postId: post.id,
        postVersionId: params.input.postVersionId,
        assignmentId: assignment.id,
        actorId: params.userId,
        action: "APPROVE",
        comment: params.input.comment ?? null,
        previousStatus: post.status,
        newStatus: nextStatus,
        createdAt: now,
      },
    });
    await writeAudit(
      {
        actorId: params.userId,
        action: "POST_APPROVED",
        entityType: "Post",
        entityId: post.id,
        postId: post.id,
        metadata: { versionNumber: version.versionNumber },
      },
      tx,
    );
    await writeNotification(
      {
        recipientId: post.creatorId,
        type: "POST_APPROVED",
        title: `Approved: ${post.title}`,
        body: `${post.title} (version ${version.versionNumber}) was approved by ${approver.displayName}.`,
        entityType: "Post",
        entityId: post.id,
        postId: post.id,
        actorId: params.userId,
        email: {
          templateKey: "post_approved",
          variables: {
            postTitle: post.title,
            version: version.versionNumber,
            approverName: approver.displayName,
            postUrl: `${config.APP_URL}/posts/${post.id}`,
          },
        },
      },
      tx,
    );

    return {
      status: "APPROVED",
      approvedVersion: version.versionNumber,
      approvedBy: approver,
      approvedAt: now.toISOString(),
    };
  });
}

export interface RequestChangesResult {
  status: "CHANGES_REQUESTED";
  version: number;
  requestedAt: string;
}

export async function requestChanges(params: {
  postId: string;
  userId: string;
  input: { postVersionId: string; lockVersion: number; comment?: string };
}): Promise<RequestChangesResult> {
  const comment = params.input.comment?.trim() ?? "";
  if (!comment) {
    throw new CommentRequiredError(
      "Explain what needs to change before returning this post.",
      "comment",
    );
  }

  return prisma.$transaction(async (tx) => {
    const post = await lockPost(tx, params.postId);
    assertLockVersion(post, params.input.lockVersion);
    assertVersionAwaitingDecision(post, params.input.postVersionId);
    const nextStatus = assertLegalTransition(post.status, "REQUEST_CHANGES");
    const assignment = await findOpenAssignment(
      tx,
      post.id,
      params.input.postVersionId,
    );

    const now = new Date();
    const [version, approver] = await Promise.all([
      tx.postVersion.findUniqueOrThrow({
        where: { id: params.input.postVersionId },
        select: { versionNumber: true },
      }),
      tx.user.findUniqueOrThrow({
        where: { id: params.userId },
        select: { displayName: true },
      }),
    ]);

    await tx.post.update({
      where: { id: post.id },
      data: {
        status: nextStatus,
        decidedAt: now,
        lockVersion: { increment: 1 },
      },
    });
    await tx.approvalAssignment.update({
      where: { id: assignment.id },
      data: { status: "COMPLETED", completedAt: now },
    });
    await tx.approvalAction.create({
      data: {
        postId: post.id,
        postVersionId: params.input.postVersionId,
        assignmentId: assignment.id,
        actorId: params.userId,
        action: "REQUEST_CHANGES",
        comment,
        previousStatus: post.status,
        newStatus: nextStatus,
        createdAt: now,
      },
    });
    await writeAudit(
      {
        actorId: params.userId,
        action: "POST_CHANGES_REQUESTED",
        entityType: "Post",
        entityId: post.id,
        postId: post.id,
        metadata: { versionNumber: version.versionNumber },
      },
      tx,
    );
    await writeNotification(
      {
        recipientId: post.creatorId,
        type: "CHANGES_REQUESTED",
        title: `Changes requested: ${post.title}`,
        body: comment,
        entityType: "Post",
        entityId: post.id,
        postId: post.id,
        actorId: params.userId,
        email: {
          templateKey: "changes_requested",
          variables: {
            approverName: approver.displayName,
            postTitle: post.title,
            comment,
            postUrl: `${config.APP_URL}/posts/${post.id}`,
          },
        },
      },
      tx,
    );

    return {
      status: "CHANGES_REQUESTED",
      version: version.versionNumber,
      requestedAt: now.toISOString(),
    };
  });
}

export interface RejectResult {
  status: "REJECTED";
  version: number;
  rejectedAt: string;
}

export async function rejectPost(params: {
  postId: string;
  userId: string;
  input: { postVersionId: string; lockVersion: number; reason?: string };
}): Promise<RejectResult> {
  const reason = params.input.reason?.trim() ?? "";
  if (!reason) {
    throw new CommentRequiredError(
      "Explain why this post is being rejected.",
      "reason",
    );
  }

  return prisma.$transaction(async (tx) => {
    const post = await lockPost(tx, params.postId);
    assertLockVersion(post, params.input.lockVersion);
    assertVersionAwaitingDecision(post, params.input.postVersionId);
    const nextStatus = assertLegalTransition(post.status, "REJECT");
    const assignment = await findOpenAssignment(
      tx,
      post.id,
      params.input.postVersionId,
    );

    const now = new Date();
    const [version, approver] = await Promise.all([
      tx.postVersion.findUniqueOrThrow({
        where: { id: params.input.postVersionId },
        select: { versionNumber: true },
      }),
      tx.user.findUniqueOrThrow({
        where: { id: params.userId },
        select: { displayName: true },
      }),
    ]);

    await tx.post.update({
      where: { id: post.id },
      data: {
        status: nextStatus,
        rejectionReason: reason,
        decidedAt: now,
        lockVersion: { increment: 1 },
      },
    });
    await tx.approvalAssignment.update({
      where: { id: assignment.id },
      data: { status: "COMPLETED", completedAt: now },
    });
    await tx.approvalAction.create({
      data: {
        postId: post.id,
        postVersionId: params.input.postVersionId,
        assignmentId: assignment.id,
        actorId: params.userId,
        action: "REJECT",
        comment: reason,
        previousStatus: post.status,
        newStatus: nextStatus,
        createdAt: now,
      },
    });
    await writeAudit(
      {
        actorId: params.userId,
        action: "POST_REJECTED",
        entityType: "Post",
        entityId: post.id,
        postId: post.id,
        metadata: { versionNumber: version.versionNumber },
      },
      tx,
    );
    await writeNotification(
      {
        recipientId: post.creatorId,
        type: "POST_REJECTED",
        title: `Rejected: ${post.title}`,
        body: reason,
        entityType: "Post",
        entityId: post.id,
        postId: post.id,
        actorId: params.userId,
        email: {
          templateKey: "post_rejected",
          variables: {
            postTitle: post.title,
            approverName: approver.displayName,
            reason,
            postUrl: `${config.APP_URL}/posts/${post.id}`,
          },
        },
      },
      tx,
    );

    return {
      status: "REJECTED",
      version: version.versionNumber,
      rejectedAt: now.toISOString(),
    };
  });
}
