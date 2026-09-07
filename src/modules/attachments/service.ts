/**
 * Attachment lifecycle above the raw pipeline: upload, read authorization,
 * deletion, and binding an ordered id list onto a frozen `PostVersion` at
 * submission. See DATABASE.md's Attachment/PostVersionAttachment tables
 * and API.md's `/api/v1/attachments` surface.
 */
import type { Attachment, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { NotFoundError, WorkflowError } from "@/server/http/handler";
import {
  ForbiddenError,
  can,
  loadAuthorizedUser,
} from "@/modules/authorization";
import { runUploadPipeline } from "./pipeline";
import type { AttachmentDto } from "./types";

export function toAttachmentDto(attachment: Attachment): AttachmentDto {
  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    width: attachment.width,
    height: attachment.height,
    durationSeconds: attachment.durationSeconds,
    status: attachment.status,
    hasThumbnail: attachment.thumbnailKey !== null,
  };
}

export async function uploadAttachment(params: {
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
  uploadedById: string;
}): Promise<AttachmentDto> {
  const attachment = await runUploadPipeline(params);
  return toAttachmentDto(attachment);
}

/** API.md: "read policy on the owning post (or uploader while temporary)". */
export async function canReadAttachment(
  attachment: Pick<Attachment, "id" | "status" | "uploadedById">,
  userId: string,
): Promise<boolean> {
  if (attachment.uploadedById === userId) return true;
  if (attachment.status === "TEMPORARY") return false;

  const link = await prisma.postVersionAttachment.findFirst({
    where: { attachmentId: attachment.id },
    select: {
      postVersion: { select: { post: { select: { creatorId: true } } } },
    },
  });
  if (!link) return false;

  const authz = await loadAuthorizedUser(userId);
  return can(authz, "POST_READ_OWN", {
    kind: "owned-post",
    creatorId: link.postVersion.post.creatorId,
  });
}

export async function getAttachmentOrThrow(
  attachmentId: string,
): Promise<Attachment> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });
  if (!attachment || attachment.deletedAt) throw new NotFoundError();
  return attachment;
}

/** DELETE `/attachments/:id` — only ever legal while unattached; an attached one is bound to a frozen version and stays put (RESTRICT). */
export async function deleteAttachment(
  attachmentId: string,
  userId: string,
): Promise<void> {
  const attachment = await getAttachmentOrThrow(attachmentId);
  if (attachment.uploadedById !== userId)
    throw new ForbiddenError("POST_EDIT_OWN");
  if (attachment.status !== "TEMPORARY") {
    throw new WorkflowError(
      "Only an unattached upload can be deleted.",
      "INVALID_TRANSITION",
    );
  }
  await prisma.attachment.update({
    where: { id: attachmentId },
    data: { deletedAt: new Date() },
  });
}

/** Every id must exist, belong to this owner, and not be soft-deleted — reused across versions is fine, so status is not restricted to TEMPORARY. */
export async function validateAttachmentOwnership(params: {
  ids: string[];
  ownerId: string;
}): Promise<boolean> {
  if (params.ids.length === 0) return true;
  const rows = await prisma.attachment.findMany({
    where: {
      id: { in: params.ids },
      uploadedById: params.ownerId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return rows.length === params.ids.length;
}

/** Ordered DTOs for the editor's media list — an id that no longer resolves (deleted) is silently dropped rather than surfaced as a broken thumbnail. */
export async function listAttachmentDtos(
  ids: string[],
): Promise<AttachmentDto[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.attachment.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is Attachment => row !== undefined)
    .map(toAttachmentDto);
}

/** Submission — binds the draft's current, ordered attachment list onto the just-frozen version. Idempotent for an already-ATTACHED id reused from an earlier version. */
export async function attachToVersion(
  tx: Prisma.TransactionClient,
  params: { postVersionId: string; attachmentIds: string[] },
): Promise<void> {
  const now = new Date();
  for (const [position, attachmentId] of params.attachmentIds.entries()) {
    await tx.postVersionAttachment.create({
      data: { postVersionId: params.postVersionId, attachmentId, position },
    });
    await tx.attachment.updateMany({
      where: { id: attachmentId, status: "TEMPORARY" },
      data: { status: "ATTACHED", attachedAt: now },
    });
  }
}
