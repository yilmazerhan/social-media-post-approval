/**
 * Threaded comments — DATABASE.md §6 ("one level of replies"), API.md's
 * `/api/v1/posts/:id/comments*`. Visible to the same people who may read
 * the post at all: its creator, or anyone `checkApprovalRead` (Phase 14)
 * already grants — a department peer, the assigned approver, or a
 * `POST_READ_ALL` holder. Reuses `approvals/loadApprovalReadResource`
 * rather than re-deriving that policy a second time.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { NotFoundError, WorkflowError } from "@/server/http/handler";
import {
  can,
  loadAuthorizedUser,
  ForbiddenError,
  type AuthorizedUser,
} from "@/modules/authorization";
import { loadApprovalReadResource } from "@/modules/approvals";
import { writeAudit } from "@/modules/audit";
import { listMentionableUsers, parseAndRenderComment } from "./mentions";
import type { CreateCommentInput, UpdateCommentInput } from "./validation";
import type { CommentDto } from "./types";

async function canAccessPost(
  authz: AuthorizedUser,
  post: { creatorId: string },
  postId: string,
): Promise<boolean> {
  if (post.creatorId === authz.id) return true;
  const resource = await loadApprovalReadResource(postId);
  return !!resource && can(authz, "APPROVAL_READ", resource.policyResource);
}

/** Throws if the caller may not see this post at all — shared by every comment endpoint. */
export async function assertCanAccessPost(
  userId: string,
  postId: string,
): Promise<AuthorizedUser> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { creatorId: true },
  });
  if (!post) throw new NotFoundError();
  const authz = await loadAuthorizedUser(userId);
  if (!(await canAccessPost(authz, post, postId))) {
    throw new ForbiddenError("APPROVAL_READ");
  }
  return authz;
}

function toDto(
  comment: {
    id: string;
    postId: string;
    postVersionId: string | null;
    postVersion: { versionNumber: number } | null;
    parentId: string | null;
    authorId: string;
    author: { displayName: string };
    body: string;
    bodyHtml: string;
    createdAt: Date;
    updatedAt: Date;
  },
  viewerId: string,
  canDeleteAll: boolean,
): Omit<CommentDto, "replies"> {
  const editWindowMs = config.COMMENT_EDIT_WINDOW_MINUTES * 60_000;
  const withinEditWindow =
    Date.now() - comment.createdAt.getTime() <= editWindowMs;
  return {
    id: comment.id,
    postId: comment.postId,
    postVersionId: comment.postVersionId,
    postVersionNumber: comment.postVersion?.versionNumber ?? null,
    parentId: comment.parentId,
    authorId: comment.authorId,
    authorName: comment.author.displayName,
    body: comment.body,
    bodyHtml: comment.bodyHtml,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    canEdit: comment.authorId === viewerId && withinEditWindow,
    canDelete: comment.authorId === viewerId || canDeleteAll,
  };
}

export async function listComments(
  postId: string,
  viewerId: string,
): Promise<CommentDto[]> {
  const authz = await assertCanAccessPost(viewerId, postId);
  const canDeleteAll = authz.permissions.has("POST_READ_ALL");

  const comments = await prisma.comment.findMany({
    where: { postId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { displayName: true } },
      postVersion: { select: { versionNumber: true } },
    },
  });

  const byParent = new Map<string | null, typeof comments>();
  for (const comment of comments) {
    const key = comment.parentId;
    const list = byParent.get(key) ?? [];
    list.push(comment);
    byParent.set(key, list);
  }

  const topLevel = byParent.get(null) ?? [];
  return topLevel.map((comment) => ({
    ...toDto(comment, viewerId, canDeleteAll),
    replies: (byParent.get(comment.id) ?? []).map((reply) => ({
      ...toDto(reply, viewerId, canDeleteAll),
      replies: [],
    })),
  }));
}

async function notifyMentions(
  tx: Prisma.TransactionClient,
  params: {
    postId: string;
    commentId: string;
    authorId: string;
    authorName: string;
    mentionedUserIds: string[];
  },
): Promise<void> {
  const recipients = params.mentionedUserIds.filter(
    (id) => id !== params.authorId,
  );
  if (recipients.length === 0) return;
  await tx.notification.createMany({
    data: recipients.map((recipientId) => ({
      recipientId,
      type: "COMMENT_MENTION" as const,
      title: `${params.authorName} mentioned you`,
      body: `${params.authorName} mentioned you in a comment.`,
      entityType: "Comment",
      entityId: params.commentId,
      postId: params.postId,
      actorId: params.authorId,
    })),
  });
}

export async function createComment(params: {
  postId: string;
  authorId: string;
  authorName: string;
  input: CreateCommentInput;
}): Promise<CommentDto> {
  const authz = await assertCanAccessPost(params.authorId, params.postId);

  let parent: { id: string; parentId: string | null } | null = null;
  if (params.input.parentId) {
    parent = await prisma.comment.findFirst({
      where: {
        id: params.input.parentId,
        postId: params.postId,
        deletedAt: null,
      },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new NotFoundError();
    if (parent.parentId) {
      throw new WorkflowError(
        "Replies can only be one level deep.",
        "INVALID_TRANSITION",
      );
    }
  }

  const candidates = await listMentionableUsers(authz, "", null);
  const { bodyHtml, mentionedUserIds } = parseAndRenderComment(
    params.input.body,
    candidates,
  );

  const created = await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        postId: params.postId,
        postVersionId: params.input.postVersionId ?? null,
        authorId: params.authorId,
        parentId: params.input.parentId ?? null,
        body: params.input.body,
        bodyHtml,
      },
      include: {
        author: { select: { displayName: true } },
        postVersion: { select: { versionNumber: true } },
      },
    });

    if (mentionedUserIds.length > 0) {
      await tx.commentMention.createMany({
        data: mentionedUserIds.map((userId) => ({
          commentId: comment.id,
          mentionedUserId: userId,
        })),
      });
    }
    await notifyMentions(tx, {
      postId: params.postId,
      commentId: comment.id,
      authorId: params.authorId,
      authorName: params.authorName,
      mentionedUserIds,
    });

    await writeAudit(
      {
        actorId: params.authorId,
        action: "COMMENT_ADDED",
        entityType: "Comment",
        entityId: comment.id,
        postId: params.postId,
      },
      tx,
    );

    return comment;
  });

  return {
    ...toDto(created, params.authorId, false),
    replies: [],
  };
}

export async function updateComment(params: {
  postId: string;
  commentId: string;
  userId: string;
  input: UpdateCommentInput;
}): Promise<CommentDto> {
  const comment = await prisma.comment.findFirst({
    where: { id: params.commentId, postId: params.postId, deletedAt: null },
  });
  if (!comment) throw new NotFoundError();
  if (comment.authorId !== params.userId) {
    throw new ForbiddenError("POST_COMMENT");
  }
  const editWindowMs = config.COMMENT_EDIT_WINDOW_MINUTES * 60_000;
  if (Date.now() - comment.createdAt.getTime() > editWindowMs) {
    throw new WorkflowError(
      "This comment can no longer be edited.",
      "INVALID_TRANSITION",
    );
  }

  const authz = await loadAuthorizedUser(params.userId);
  const previousMentions = new Set(
    (
      await prisma.commentMention.findMany({
        where: { commentId: comment.id },
        select: { mentionedUserId: true },
      })
    ).map((m) => m.mentionedUserId),
  );
  const candidates = await listMentionableUsers(authz, "", null);
  const { bodyHtml, mentionedUserIds } = parseAndRenderComment(
    params.input.body,
    candidates,
  );
  const newlyMentioned = mentionedUserIds.filter(
    (id) => !previousMentions.has(id),
  );

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.comment.update({
      where: { id: comment.id },
      data: { body: params.input.body, bodyHtml },
      include: {
        author: { select: { displayName: true } },
        postVersion: { select: { versionNumber: true } },
      },
    });
    await tx.commentMention.deleteMany({ where: { commentId: comment.id } });
    if (mentionedUserIds.length > 0) {
      await tx.commentMention.createMany({
        data: mentionedUserIds.map((userId) => ({
          commentId: comment.id,
          mentionedUserId: userId,
        })),
      });
    }
    if (newlyMentioned.length > 0) {
      await notifyMentions(tx, {
        postId: params.postId,
        commentId: comment.id,
        authorId: params.userId,
        authorName: result.author.displayName,
        mentionedUserIds: newlyMentioned,
      });
    }
    await writeAudit(
      {
        actorId: params.userId,
        action: "COMMENT_EDITED",
        entityType: "Comment",
        entityId: comment.id,
        postId: params.postId,
      },
      tx,
    );
    return result;
  });

  return { ...toDto(updated, params.userId, false), replies: [] };
}

export async function deleteComment(params: {
  postId: string;
  commentId: string;
  userId: string;
}): Promise<void> {
  const comment = await prisma.comment.findFirst({
    where: { id: params.commentId, postId: params.postId, deletedAt: null },
  });
  if (!comment) throw new NotFoundError();

  const authz = await loadAuthorizedUser(params.userId);
  const isAdmin = authz.permissions.has("POST_READ_ALL");
  if (comment.authorId !== params.userId && !isAdmin) {
    throw new ForbiddenError("POST_COMMENT");
  }

  await prisma.$transaction(async (tx) => {
    await tx.comment.update({
      where: { id: comment.id },
      data: { deletedAt: new Date() },
    });
    await writeAudit(
      {
        actorId: params.userId,
        action: "COMMENT_DELETED",
        entityType: "Comment",
        entityId: comment.id,
        postId: params.postId,
      },
      tx,
    );
  });
}
