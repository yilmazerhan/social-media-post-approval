/**
 * Draft CRUD and the readiness checklist — UI_UX_SPEC.md §4. Submission
 * itself (freezing a version, transitioning status, creating the
 * assignment) lives in submit.ts; this file only ever touches
 * `Post.draft*` fields, never `PostVersion` — ADR-006.
 */
import type { Priority, Prisma } from "@/generated/prisma/client";
import { config } from "@/server/config";
import { prisma } from "@/server/db";
import {
  WorkflowError,
  NotFoundError,
  NotReadyError,
} from "@/server/http/handler";
import { resolveApprovalRoute, resolveAssigneeName } from "@/modules/approvals";
import { writeAudit } from "@/modules/audit";
import {
  listAttachmentDtos,
  validateAttachmentOwnership,
} from "@/modules/attachments";
import {
  EMPTY_DOCUMENT,
  tiptapDocumentSchema,
  toJsonInput,
} from "./content-schema";
import { countCharacters, extractPlainText } from "./content-render";
import { createWithGeneratedReference } from "./reference";
import type {
  CreatePostInput,
  UpdatePostInput,
  AutosavePostInput,
} from "./validation";
import type {
  ChangesRequestedBanner,
  PostEditorDto,
  ReadinessChecklist,
} from "./types";

const EDITABLE_STATUSES = new Set(["DRAFT", "CHANGES_REQUESTED", "APPROVED"]);

/**
 * ARCHITECTURE.md §4: "Editing an `APPROVED` post is allowed only by
 * creating a new version, which moves the post back to `DRAFT` and clears
 * `approvedVersionId` from the post header. The historical approval row
 * survives and still points at the version it approved." Not a
 * state-machine transition — state-machine.ts's own comment says this
 * deliberately isn't one of `ApprovalActionType`'s nine values — so this
 * is a direct status flip, applied the first time any draft mutation
 * reaches an `APPROVED` post; submitting afterwards is then just the
 * ordinary DRAFT → SUBMITTED row already in that table, freezing the new
 * version through the exact same `submit.ts` path as everything else
 * (ADR-006: "an approved post that is edited returns to DRAFT with a new
 * version pending").
 */
async function reopenIfApproved(postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      status: true,
      creatorId: true,
      creator: { select: { email: true } },
    },
  });
  if (!post || post.status !== "APPROVED") return;

  await prisma.post.update({
    where: { id: postId },
    data: { status: "DRAFT", approvedVersionId: null },
  });
  await writeAudit({
    actorId: post.creatorId,
    actorEmail: post.creator.email,
    action: "POST_REOPENED_FOR_EDIT",
    entityType: "Post",
    entityId: postId,
    postId,
  });
}

function parseDraftContent(value: unknown) {
  if (value === null || value === undefined) return EMPTY_DOCUMENT;
  const parsed = tiptapDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_DOCUMENT;
}

function parseDraftAttachmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export async function createDraft(params: {
  creatorId: string;
  creatorEmail: string;
  input: CreatePostInput;
}): Promise<{ id: string; reference: string }> {
  const title = params.input.title ?? "";
  const post = await createWithGeneratedReference(prisma, (reference) =>
    prisma.post.create({
      data: {
        reference,
        title,
        creatorId: params.creatorId,
        draftTitle: title,
        draftContentJson: toJsonInput(EMPTY_DOCUMENT),
        draftAttachmentIds: [],
        draftUpdatedAt: new Date(),
      },
      select: { id: true, reference: true },
    }),
  );
  await writeAudit({
    actorId: params.creatorId,
    actorEmail: params.creatorEmail,
    action: "POST_CREATED",
    entityType: "Post",
    entityId: post.id,
    postId: post.id,
  });
  return post;
}

async function loadChangesRequestedBanner(
  postId: string,
): Promise<ChangesRequestedBanner | null> {
  const action = await prisma.approvalAction.findFirst({
    where: { postId, action: "REQUEST_CHANGES" },
    orderBy: { createdAt: "desc" },
    select: {
      comment: true,
      createdAt: true,
      actor: { select: { displayName: true } },
      postVersion: { select: { versionNumber: true } },
    },
  });
  if (!action || !action.comment) return null;
  return {
    comment: action.comment,
    actorName: action.actor.displayName,
    createdAt: action.createdAt.toISOString(),
    versionNumber: action.postVersion.versionNumber,
  };
}

export async function getPostForEdit(
  postId: string,
  userId: string,
): Promise<PostEditorDto | null> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return null;

  const isOwner = post.creatorId === userId;
  const isEditableState = EDITABLE_STATUSES.has(post.status);
  const attachments = await listAttachmentDtos(
    parseDraftAttachmentIds(post.draftAttachmentIds),
  );

  return {
    id: post.id,
    reference: post.reference,
    title: post.title,
    status: post.status,
    priority: post.priority,
    departmentId: post.departmentId,
    draftTitle: post.draftTitle,
    draftContentJson: parseDraftContent(post.draftContentJson),
    attachments,
    draftUpdatedAt: post.draftUpdatedAt?.toISOString() ?? null,
    requestedApproverId: post.requestedApproverId,
    requestedGroupId: post.requestedGroupId,
    changeSummary: null,
    lockVersion: post.lockVersion,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    capabilities: {
      canEdit: isOwner && isEditableState,
      canSubmit: isOwner && isEditableState,
    },
    changesRequested:
      post.status === "CHANGES_REQUESTED"
        ? await loadChangesRequestedBanner(post.id)
        : null,
  };
}

/** Full update: metadata + draft content, guarded by `lockVersion` — API.md's PATCH `/posts/:id`. */
export async function updateDraft(params: {
  postId: string;
  creatorId: string;
  input: UpdatePostInput;
}): Promise<{ lockVersion: number; draftUpdatedAt: string }> {
  const { postId, creatorId, input } = params;
  const now = new Date();

  await reopenIfApproved(postId);

  if (input.attachmentIds !== undefined) {
    const ownershipOk = await validateAttachmentOwnership({
      ids: input.attachmentIds,
      ownerId: creatorId,
    });
    if (!ownershipOk) {
      throw new NotReadyError("Some attachments couldn't be saved.", [
        {
          field: "attachmentIds",
          message:
            "One or more attachments are invalid or belong to someone else.",
        },
      ]);
    }
  }

  const data: Prisma.PostUncheckedUpdateManyInput = {
    draftUpdatedAt: now,
    lockVersion: { increment: 1 },
  };
  if (input.title !== undefined) {
    data.title = input.title;
    data.draftTitle = input.title;
  }
  if (input.contentJson !== undefined) {
    data.draftContentJson = toJsonInput(input.contentJson);
  }
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.departmentId !== undefined) data.departmentId = input.departmentId;
  if (input.requestedApproverId !== undefined) {
    data.requestedApproverId = input.requestedApproverId;
  }
  if (input.requestedGroupId !== undefined) {
    data.requestedGroupId = input.requestedGroupId;
  }
  if (input.attachmentIds !== undefined) {
    data.draftAttachmentIds = input.attachmentIds;
  }

  const result = await prisma.post.updateMany({
    where: { id: postId, lockVersion: input.lockVersion },
    data,
  });

  if (result.count === 0) {
    const exists = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError();
    throw new WorkflowError(
      "This post changed elsewhere. Reload and try again.",
      "STALE_RESOURCE",
    );
  }

  return {
    lockVersion: input.lockVersion + 1,
    draftUpdatedAt: now.toISOString(),
  };
}

/** The lightweight autosave path — no `lockVersion`, per API.md. */
export async function autosaveDraft(params: {
  postId: string;
  input: AutosavePostInput;
}): Promise<{ draftUpdatedAt: string }> {
  const now = new Date();

  await reopenIfApproved(params.postId);

  const data: Prisma.PostUpdateInput = {
    draftContentJson: toJsonInput(params.input.contentJson),
    draftUpdatedAt: now,
  };
  if (params.input.title !== undefined) {
    data.draftTitle = params.input.title;
  }
  const post = await prisma.post.update({
    where: { id: params.postId },
    data,
    select: { draftUpdatedAt: true },
  });
  return { draftUpdatedAt: (post.draftUpdatedAt ?? now).toISOString() };
}

/**
 * The pure part of the readiness checklist, over an already-loaded post —
 * used both by `getReadiness` and by submit.ts, which computes this again
 * against the row it just locked with `SELECT ... FOR UPDATE` rather than
 * trusting a read from before the transaction started.
 */
export async function computeReadinessForPost(post: {
  draftTitle: string | null;
  draftContentJson: unknown;
  draftAttachmentIds: unknown;
  departmentId: string | null;
  priority: Priority;
  creatorId: string;
  requestedApproverId: string | null;
  requestedGroupId: string | null;
}): Promise<ReadinessChecklist> {
  const draftContent = parseDraftContent(post.draftContentJson);
  const plainText = extractPlainText(draftContent);
  const characterCount = countCharacters(plainText);
  const attachmentIds = parseDraftAttachmentIds(post.draftAttachmentIds);
  const attachmentsValid = await validateAttachmentOwnership({
    ids: attachmentIds,
    ownerId: post.creatorId,
  });

  const route = await resolveApprovalRoute({
    departmentId: post.departmentId,
    priority: post.priority,
    creatorId: post.creatorId,
    requestedApproverId: post.requestedApproverId,
    requestedGroupId: post.requestedGroupId,
  });

  const items: ReadinessChecklist["items"] = [
    {
      key: "title",
      label: "Title provided",
      passed: (post.draftTitle ?? "").trim().length > 0,
    },
    {
      key: "content",
      label: `Content provided (${characterCount} ch)`,
      passed:
        characterCount > 0 && characterCount <= config.POST_MAX_CHARACTERS,
    },
    {
      key: "attachments",
      label:
        attachmentIds.length > 0
          ? `${attachmentIds.length} attachment${attachmentIds.length === 1 ? "" : "s"} valid`
          : "Attachments valid",
      passed: attachmentsValid,
    },
    {
      key: "department",
      label: "Department required",
      passed: post.departmentId !== null,
    },
    {
      key: "route",
      label: "Approval route selected",
      passed: route !== null,
    },
  ];

  let routePreview: ReadinessChecklist["routePreview"] = null;
  if (route) {
    const assigneeName = await resolveAssigneeName(route);
    if (assigneeName) {
      routePreview = { ruleName: route.rule.name, assigneeName };
    }
  }

  return {
    items,
    ready: items.every((item) => item.passed),
    routePreview,
  };
}

export async function getReadiness(
  postId: string,
): Promise<ReadinessChecklist> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new NotFoundError();
  return computeReadinessForPost(post);
}
