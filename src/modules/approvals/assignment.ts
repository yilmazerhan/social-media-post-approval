/**
 * Manual assignment/reassignment — API.md's `POST /:postId/assign`
 * ("assign or reassign an approver"). `APPROVAL_ASSIGN` is grant-only (not
 * resource-scoped, AUTHENTICATION.md §5), so unlike the four decisions in
 * decisions.ts this never checks who the post belongs to — anyone holding
 * the permission may redirect any open assignment. Doesn't touch
 * `Post.status` or `lockVersion`: only the assignment row changes, so this
 * isn't one of `assertLegalTransition`'s (from, action, to) rows even
 * though `ASSIGN`/`REASSIGN` are `ApprovalActionType` values.
 */
import { prisma } from "@/server/db";
import { NotFoundError, WorkflowError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import { writeNotification, enqueueGroupFanout } from "@/modules/notifications";
import type { ReassignInput } from "./validation";

export interface ReassignResult {
  assigneeName: string | null;
}

export async function reassignApproval(params: {
  postId: string;
  actorId: string;
  input: ReassignInput;
}): Promise<ReassignResult> {
  await prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({
      where: { id: params.postId },
      select: { status: true, title: true },
    });
    if (!post) throw new NotFoundError();

    const assignment = await tx.approvalAssignment.findFirst({
      where: {
        postId: params.postId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });
    if (!assignment) {
      throw new WorkflowError(
        "This post has no open assignment to reassign.",
        "INVALID_TRANSITION",
      );
    }
    await tx.$queryRaw`SELECT id FROM "ApprovalAssignment" WHERE id = ${assignment.id} FOR UPDATE`;

    const priorManualAssignment = await tx.approvalAction.findFirst({
      where: {
        assignmentId: assignment.id,
        action: { in: ["ASSIGN", "REASSIGN"] },
      },
    });
    const action = priorManualAssignment ? "REASSIGN" : "ASSIGN";

    const now = new Date();
    await tx.approvalAssignment.update({
      where: { id: assignment.id },
      data: {
        assigneeUserId: params.input.assigneeUserId ?? null,
        assigneeGroupId: params.input.assigneeGroupId ?? null,
        assignedById: params.actorId,
        assignedAt: now,
      },
    });
    await tx.approvalAction.create({
      data: {
        postId: params.postId,
        postVersionId: assignment.postVersionId,
        assignmentId: assignment.id,
        actorId: params.actorId,
        action,
        previousStatus: post.status,
        newStatus: post.status,
        createdAt: now,
      },
    });
    await writeAudit(
      {
        actorId: params.actorId,
        action:
          action === "ASSIGN" ? "APPROVAL_ASSIGNED" : "APPROVAL_REASSIGNED",
        entityType: "ApprovalAssignment",
        entityId: assignment.id,
        postId: params.postId,
      },
      tx,
    );

    const assignedNotification = {
      type: "APPROVAL_ASSIGNED" as const,
      title: `Approval needed: ${post.title}`,
      body: `${post.title} needs your review.`,
      entityType: "Post",
      entityId: params.postId,
      postId: params.postId,
      actorId: params.actorId,
    };
    if (params.input.assigneeUserId) {
      await writeNotification(
        { ...assignedNotification, recipientId: params.input.assigneeUserId },
        tx,
      );
    } else if (params.input.assigneeGroupId) {
      await enqueueGroupFanout(
        { ...assignedNotification, groupId: params.input.assigneeGroupId },
        tx,
      );
    }
  });

  if (params.input.assigneeUserId) {
    const user = await prisma.user.findUnique({
      where: { id: params.input.assigneeUserId },
      select: { displayName: true },
    });
    return { assigneeName: user?.displayName ?? null };
  }
  if (params.input.assigneeGroupId) {
    const group = await prisma.group.findUnique({
      where: { id: params.input.assigneeGroupId },
      select: { name: true },
    });
    return { assigneeName: group?.name ?? null };
  }
  return { assigneeName: null };
}
