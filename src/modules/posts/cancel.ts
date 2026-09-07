/**
 * Cancellation — API.md's `POST /:id/cancel` ("creator or admin"). Legal
 * only from `DRAFT` or `SUBMITTED` (state-machine.ts's own `CANCEL` rows);
 * `IN_REVIEW` and beyond have no cancel path. A never-submitted `DRAFT` has
 * no `PostVersion` yet, so unlike every other decision here there is
 * nothing for an `ApprovalAction` row to name — that row is written only
 * when a version already exists (i.e. cancelling a `SUBMITTED` post).
 */
import { prisma } from "@/server/db";
import { WorkflowError, NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import { assertLegalTransition } from "@/modules/approvals";
import type { CancelPostInput } from "./validation";

export interface CancelResult {
  status: "CANCELLED";
}

export async function cancelPost(params: {
  postId: string;
  userId: string;
  input: CancelPostInput;
}): Promise<CancelResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${params.postId} FOR UPDATE`;

    const post = await tx.post.findUnique({ where: { id: params.postId } });
    if (!post) throw new NotFoundError();

    if (post.lockVersion !== params.input.lockVersion) {
      throw new WorkflowError(
        "This post changed elsewhere. Reload and try again.",
        "STALE_RESOURCE",
      );
    }

    const nextStatus = assertLegalTransition(post.status, "CANCEL");
    const now = new Date();

    await tx.post.update({
      where: { id: post.id },
      data: {
        status: nextStatus,
        decidedAt: now,
        lockVersion: { increment: 1 },
      },
    });

    const assignment = await tx.approvalAssignment.findFirst({
      where: { postId: post.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
    });
    if (assignment) {
      await tx.approvalAssignment.update({
        where: { id: assignment.id },
        data: { status: "CANCELLED", completedAt: now },
      });
    }

    if (post.currentVersionId) {
      await tx.approvalAction.create({
        data: {
          postId: post.id,
          postVersionId: post.currentVersionId,
          assignmentId: assignment?.id,
          actorId: params.userId,
          action: "CANCEL",
          previousStatus: post.status,
          newStatus: nextStatus,
          createdAt: now,
        },
      });
    }

    await writeAudit(
      {
        actorId: params.userId,
        action: "POST_CANCELLED",
        entityType: "Post",
        entityId: post.id,
        postId: post.id,
      },
      tx,
    );

    return { status: "CANCELLED" };
  });
}
