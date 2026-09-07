/**
 * Read-only version/detail/activity views — UI_UX_SPEC.md §6's Post
 * Details tabs (Overview, Versions, Approval history, Activity) and
 * API.md's `/:id/versions*`, `/:id/activity` endpoints. Nothing here
 * mutates anything; submission (the only place a `PostVersion` is
 * frozen) stays in `submit.ts` per ADR-006.
 */
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import { listAttachmentDtos } from "@/modules/attachments";
import { computeWordDiff } from "@/lib/diff";
import type {
  PostDetailDto,
  VersionSummaryDto,
  VersionDetailDto,
  VersionCompareDto,
  ActivityEntryDto,
} from "./types";

const EDITABLE_STATUSES = new Set(["DRAFT", "CHANGES_REQUESTED", "APPROVED"]);

export async function getPostDetail(
  postId: string,
  userId: string,
): Promise<PostDetailDto | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      creator: { select: { displayName: true } },
      department: { select: { name: true } },
      currentVersion: { select: { versionNumber: true } },
      approvedVersion: { select: { versionNumber: true } },
    },
  });
  if (!post) return null;

  const openAssignment = await prisma.approvalAssignment.findFirst({
    where: { postId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    orderBy: { assignedAt: "desc" },
    select: {
      assigneeUser: { select: { displayName: true } },
      assigneeGroup: { select: { name: true } },
    },
  });

  return {
    id: post.id,
    reference: post.reference,
    title: post.title,
    status: post.status,
    priority: post.priority,
    creatorName: post.creator.displayName,
    departmentName: post.department?.name ?? null,
    currentVersionNumber: post.currentVersion?.versionNumber ?? null,
    approvedVersionNumber: post.approvedVersion?.versionNumber ?? null,
    approverName:
      openAssignment?.assigneeUser?.displayName ??
      openAssignment?.assigneeGroup?.name ??
      null,
    submittedAt: post.submittedAt?.toISOString() ?? null,
    decidedAt: post.decidedAt?.toISOString() ?? null,
    dueAt: post.dueAt?.toISOString() ?? null,
    rejectionReason: post.rejectionReason,
    createdAt: post.createdAt.toISOString(),
    capabilities: {
      canEdit: post.creatorId === userId && EDITABLE_STATUSES.has(post.status),
    },
  };
}

function toVersionSummary(version: {
  id: string;
  versionNumber: number;
  title: string;
  createdAt: Date;
  submittedAt: Date | null;
  changeSummary: string | null;
  createdBy: { displayName: string };
  attachments: unknown[];
}): VersionSummaryDto {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    title: version.title,
    createdAt: version.createdAt.toISOString(),
    submittedAt: version.submittedAt?.toISOString() ?? null,
    changeSummary: version.changeSummary,
    createdByName: version.createdBy.displayName,
    attachmentCount: version.attachments.length,
  };
}

export async function listVersions(
  postId: string,
): Promise<VersionSummaryDto[]> {
  const versions = await prisma.postVersion.findMany({
    where: { postId },
    orderBy: { versionNumber: "desc" },
    include: {
      createdBy: { select: { displayName: true } },
      attachments: { select: { attachmentId: true } },
    },
  });
  return versions.map(toVersionSummary);
}

async function getVersionOrThrow(postId: string, versionId: string) {
  const version = await prisma.postVersion.findFirst({
    where: { id: versionId, postId },
    include: {
      createdBy: { select: { displayName: true } },
      attachments: {
        orderBy: { position: "asc" },
        select: { attachmentId: true },
      },
    },
  });
  if (!version) throw new NotFoundError();
  return version;
}

export async function getVersion(
  postId: string,
  versionId: string,
): Promise<VersionDetailDto> {
  const version = await getVersionOrThrow(postId, versionId);
  const attachments = await listAttachmentDtos(
    version.attachments.map((a) => a.attachmentId),
  );
  return {
    ...toVersionSummary(version),
    contentHtml: version.contentHtml,
    characterCount: version.characterCount,
    wordCount: version.wordCount,
    attachments,
  };
}

export async function compareVersions(
  postId: string,
  fromVersionId: string,
  toVersionId: string,
): Promise<VersionCompareDto> {
  const [from, to] = await Promise.all([
    getVersionOrThrow(postId, fromVersionId),
    getVersionOrThrow(postId, toVersionId),
  ]);

  const fromIds = from.attachments.map((a) => a.attachmentId);
  const toIds = to.attachments.map((a) => a.attachmentId);
  const fromSet = new Set(fromIds);
  const toSet = new Set(toIds);

  const addedIds = toIds.filter((id) => !fromSet.has(id));
  const removedIds = fromIds.filter((id) => !toSet.has(id));
  const commonBothOrders = fromIds.filter((id) => toSet.has(id));
  const commonToOrder = toIds.filter((id) => fromSet.has(id));
  const reordered = commonBothOrders.join(",") !== commonToOrder.join(",");

  const [added, removed] = await Promise.all([
    listAttachmentDtos(addedIds),
    listAttachmentDtos(removedIds),
  ]);

  return {
    from: toVersionSummary(from),
    to: toVersionSummary(to),
    titleChanged: from.title !== to.title,
    // UI_UX_SPEC.md §5: word-level diff "over the extracted plain text" —
    // contentText, not contentHtml (never diff markup).
    textDiff: computeWordDiff(from.contentText, to.contentText),
    attachmentDelta: { added, removed, reordered },
  };
}

/** API.md: "merged timeline of actions, comments, versions." */
export async function getActivity(postId: string): Promise<ActivityEntryDto[]> {
  const [versions, actions, comments] = await Promise.all([
    prisma.postVersion.findMany({
      where: { postId },
      select: {
        id: true,
        versionNumber: true,
        createdAt: true,
        createdBy: { select: { displayName: true } },
      },
    }),
    prisma.approvalAction.findMany({
      where: { postId },
      select: {
        id: true,
        action: true,
        comment: true,
        createdAt: true,
        actor: { select: { displayName: true } },
        postVersion: { select: { versionNumber: true } },
      },
    }),
    prisma.comment.findMany({
      where: { postId, deletedAt: null },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { displayName: true } },
        postVersion: { select: { versionNumber: true } },
      },
    }),
  ]);

  const entries: ActivityEntryDto[] = [
    ...versions.map((v) => ({
      id: `version:${v.id}`,
      type: "VERSION_CREATED" as const,
      createdAt: v.createdAt.toISOString(),
      actorName: v.createdBy.displayName,
      action: null,
      versionNumber: v.versionNumber,
      detail: null,
    })),
    ...actions.map((a) => ({
      id: `action:${a.id}`,
      type: "ACTION" as const,
      createdAt: a.createdAt.toISOString(),
      actorName: a.actor.displayName,
      action: a.action,
      versionNumber: a.postVersion.versionNumber,
      detail: a.comment,
    })),
    ...comments.map((c) => ({
      id: `comment:${c.id}`,
      type: "COMMENT" as const,
      createdAt: c.createdAt.toISOString(),
      actorName: c.author.displayName,
      action: null,
      versionNumber: c.postVersion?.versionNumber ?? null,
      detail: c.body,
    })),
  ];

  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return entries;
}
