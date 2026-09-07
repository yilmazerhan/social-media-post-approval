/**
 * API.md's `DELETE /:id` — "drafts only; soft delete". `POST_DELETE_OWN`
 * has been in the permission catalogue and granted to EMPLOYEE since
 * Phase 5, but nothing ever called it until now.
 */
import { prisma } from "@/server/db";
import { WorkflowError, NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";

export async function deletePost(params: {
  postId: string;
  userId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({
      where: { id: params.postId },
      select: { status: true, deletedAt: true },
    });
    if (!post || post.deletedAt) throw new NotFoundError();
    if (post.status !== "DRAFT") {
      throw new WorkflowError(
        "Only a draft can be deleted.",
        "INVALID_TRANSITION",
      );
    }

    await tx.post.update({
      where: { id: params.postId },
      data: { deletedAt: new Date() },
    });

    await writeAudit(
      {
        actorId: params.userId,
        action: "POST_DELETED",
        entityType: "Post",
        entityId: params.postId,
        postId: params.postId,
      },
      tx,
    );
  });
}
