/**
 * API.md's `POST /:id/duplicate` — "new draft seeded from a version".
 * Copies title, content, department and priority from the source post's
 * current version into a brand-new `DRAFT`; attachments are deliberately
 * not copied (they're files tied to a specific version, not the post
 * header, and re-attaching them to a new draft would need its own
 * ownership/validity pass for a low-value corner of this feature).
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import { EMPTY_DOCUMENT, toJsonInput } from "./content-schema";
import { createWithGeneratedReference } from "./reference";

export async function duplicatePost(params: {
  sourcePostId: string;
  creatorId: string;
  creatorEmail?: string;
}): Promise<{ id: string; reference: string }> {
  const source = await prisma.post.findUnique({
    where: { id: params.sourcePostId },
    select: {
      title: true,
      priority: true,
      departmentId: true,
      currentVersion: { select: { contentJson: true } },
    },
  });
  if (!source) throw new NotFoundError();

  const title = source.title ? `Copy of ${source.title}` : "";
  const contentJson: Prisma.InputJsonValue = source.currentVersion
    ? (source.currentVersion.contentJson as Prisma.InputJsonValue)
    : toJsonInput(EMPTY_DOCUMENT);

  const post = await createWithGeneratedReference(prisma, (reference) =>
    prisma.post.create({
      data: {
        reference,
        title,
        creatorId: params.creatorId,
        departmentId: source.departmentId,
        priority: source.priority,
        draftTitle: title,
        draftContentJson: contentJson,
        draftAttachmentIds: [],
        draftUpdatedAt: new Date(),
      },
      select: { id: true, reference: true },
    }),
  );

  await writeAudit({
    actorId: params.creatorId,
    actorEmail: params.creatorEmail,
    action: "POST_DUPLICATED",
    entityType: "Post",
    entityId: post.id,
    postId: post.id,
    metadata: { duplicatedFromPostId: params.sourcePostId },
  });

  return post;
}
