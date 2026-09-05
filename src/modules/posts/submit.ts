/**
 * Submission — ARCHITECTURE.md §4's Versioning rules ("only submission
 * freezes a version") and §4's Concurrency ("`SELECT … FOR UPDATE` on the
 * post row"), plus DATABASE.md §5 ("Routing is computed server-side at
 * submission — never in the frontend"). One transaction: lock the post,
 * re-check the readiness checklist against what's actually there, resolve
 * the route, freeze the version, transition the status, create the
 * assignment, and record the action.
 *
 * What this deliberately does not do yet: compute `dueAt`/`warningAt`
 * (Phase 19 owns SLA policy math) or send a notification (Phase 16/17) —
 * both real gaps, not faked data.
 */
import type { ApprovalActionType } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import {
  WorkflowError,
  NotFoundError,
  NotReadyError,
} from "@/server/http/handler";
import {
  assertLegalTransition,
  resolveApprovalRoute,
  resolveAssigneeName,
} from "@/modules/approvals";
import { writeAudit } from "@/modules/audit";
import {
  tiptapDocumentSchema,
  EMPTY_DOCUMENT,
  toJsonInput,
} from "./content-schema";
import {
  renderContentHtml,
  extractPlainText,
  countCharacters,
  countWords,
} from "./content-render";
import { computeReadinessForPost } from "./service";
import type { SubmitPostInput } from "./validation";

export interface SubmitResult {
  postId: string;
  reference: string;
  versionNumber: number;
  assigneeName: string | null;
}

export async function submitPost(params: {
  postId: string;
  input: SubmitPostInput;
}): Promise<SubmitResult> {
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

    const action: ApprovalActionType =
      post.status === "DRAFT" ? "SUBMIT" : "RESUBMIT";
    const nextStatus = assertLegalTransition(post.status, action);

    const readiness = await computeReadinessForPost(post);
    if (!readiness.ready) {
      throw new NotReadyError(
        "This post isn't ready to submit.",
        readiness.items
          .filter((item) => !item.passed)
          .map((item) => ({ field: item.key, message: item.label })),
      );
    }

    const route = await resolveApprovalRoute({
      departmentId: post.departmentId,
      priority: post.priority,
      creatorId: post.creatorId,
      requestedApproverId: post.requestedApproverId,
      requestedGroupId: post.requestedGroupId,
    });
    if (!route) {
      // Readiness already checked this, but state could theoretically
      // move between the two reads within the same transaction snapshot
      // in READ COMMITTED mode — fail the same way rather than proceed.
      throw new NotReadyError("This post isn't ready to submit.", [
        { field: "route", message: "Approval route selected" },
      ]);
    }

    const parsedContent = tiptapDocumentSchema.safeParse(
      post.draftContentJson ?? EMPTY_DOCUMENT,
    );
    const content = parsedContent.success ? parsedContent.data : EMPTY_DOCUMENT;
    const contentHtml = renderContentHtml(content);
    const plainText = extractPlainText(content);
    const characterCount = countCharacters(plainText);
    const wordCount = countWords(plainText);
    const title = post.draftTitle ?? post.title;

    const previousVersion = await tx.postVersion.findFirst({
      where: { postId: post.id },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true },
    });
    const versionNumber = (previousVersion?.versionNumber ?? 0) + 1;
    const now = new Date();

    const version = await tx.postVersion.create({
      data: {
        postId: post.id,
        versionNumber,
        title,
        contentJson: toJsonInput(content),
        contentHtml,
        contentText: plainText,
        characterCount,
        wordCount,
        createdById: post.creatorId,
        submittedAt: now,
        supersedesVersionId: previousVersion?.id,
      },
      select: { id: true },
    });

    await tx.post.update({
      where: { id: post.id },
      data: {
        status: nextStatus,
        title,
        currentVersionId: version.id,
        approvalRouteId: route.rule.id,
        submittedAt: now,
        lockVersion: { increment: 1 },
      },
    });

    await tx.approvalAssignment.create({
      data: {
        postId: post.id,
        postVersionId: version.id,
        assigneeUserId: route.assigneeUserId,
        assigneeGroupId: route.assigneeGroupId,
        ruleId: route.rule.id,
        status: "PENDING",
        assignedAt: now,
      },
    });

    await tx.approvalAction.create({
      data: {
        postId: post.id,
        postVersionId: version.id,
        actorId: post.creatorId,
        action,
        previousStatus: post.status,
        newStatus: nextStatus,
        createdAt: now,
      },
    });

    await writeAudit(
      {
        actorId: post.creatorId,
        action: action === "SUBMIT" ? "POST_SUBMITTED" : "POST_RESUBMITTED",
        entityType: "Post",
        entityId: post.id,
        postId: post.id,
        metadata: { versionNumber, ruleId: route.rule.id },
      },
      tx,
    );

    const assigneeName = await resolveAssigneeName(route);

    return {
      postId: post.id,
      reference: post.reference,
      versionNumber,
      assigneeName,
    };
  });
}
