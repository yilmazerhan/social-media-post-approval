import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  createDraft,
  updateDraft,
  submitPost,
  cancelPost,
  type TiptapDocument,
} from "@/modules/posts";
import {
  startReview,
  approvePost,
  rejectPost,
  requestChanges,
} from "@/modules/approvals";
import { WorkflowError, CommentRequiredError } from "@/server/http/handler";

/**
 * Phase 11 — the four decision transitions and cancellation. Exit
 * criterion (IMPLEMENTATION_PLAN.md): every legal transition passes, every
 * illegal one is refused with `INVALID_TRANSITION` (or the more specific
 * `ALREADY_DECIDED`/`STALE_RESOURCE` 409), and a concurrent double-approve
 * leaves exactly one approval standing.
 */

const createdPostIds: string[] = [];
const createdUserIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdRuleIds: string[] = [];

afterAll(async () => {
  if (createdPostIds.length) {
    await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  }
  if (createdRuleIds.length) {
    await prisma.approvalRule.deleteMany({
      where: { id: { in: createdRuleIds } },
    });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (createdDepartmentIds.length) {
    await prisma.department.deleteMany({
      where: { id: { in: createdDepartmentIds } },
    });
  }
  await prisma.$disconnect();
});

async function createUser(displayName: string) {
  const user = await prisma.user.create({
    data: {
      email: `decisions-${randomUUID()}@editortest.local`,
      displayName,
      firstName: displayName,
      lastName: "Test",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createRoutableDepartment(approverId: string) {
  const department = await prisma.department.create({
    data: { key: `decisions-dept-${randomUUID()}`, name: "Decisions Dept" },
  });
  createdDepartmentIds.push(department.id);
  const rule = await prisma.approvalRule.create({
    data: {
      name: `decisions-rule-${randomUUID()}`,
      isActive: true,
      priorityOrder: 1,
      departmentId: department.id,
      targetType: "USER",
      targetUserId: approverId,
    },
  });
  createdRuleIds.push(rule.id);
  return department;
}

function doc(text: string): TiptapDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function submittedPost(approverId: string, creatorId: string) {
  const department = await createRoutableDepartment(approverId);
  const { id } = await createDraft({
    creatorId,
    creatorEmail: `${creatorId}@editortest.local`,
    input: { title: "Decisions post" },
  });
  createdPostIds.push(id);
  await updateDraft({
    postId: id,
    creatorId,
    input: {
      lockVersion: 0,
      contentJson: doc("Original body."),
      departmentId: department.id,
    },
  });
  const submitted = await submitPost({ postId: id, input: { lockVersion: 1 } });
  const post = await prisma.post.findUniqueOrThrow({ where: { id } });
  if (!post.currentVersionId) {
    throw new Error("expected submitPost to set currentVersionId");
  }
  return { postId: id, post, versionId: post.currentVersionId, submitted };
}

describe("startReview", () => {
  it("moves SUBMITTED to IN_REVIEW, and a repeat call is idempotent", async () => {
    const approver = await createUser("Start Review Approver");
    const creator = await createUser("Start Review Creator");
    const { postId } = await submittedPost(approver.id, creator.id);

    const first = await startReview({ postId, userId: approver.id });
    expect(first.status).toBe("IN_REVIEW");

    const postRow = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(postRow.status).toBe("IN_REVIEW");
    const assignment = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId },
    });
    expect(assignment.status).toBe("IN_PROGRESS");
    const lockVersionAfterFirst = postRow.lockVersion;

    const second = await startReview({ postId, userId: approver.id });
    expect(second.status).toBe("IN_REVIEW");
    const postRowAfterSecond = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(postRowAfterSecond.lockVersion).toBe(lockVersionAfterFirst);
  });

  it("refuses START_REVIEW from a DRAFT", async () => {
    const approver = await createUser("Start Review Draft Approver");
    const creator = await createUser("Start Review Draft Creator");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Never submitted" },
    });
    createdPostIds.push(id);

    await expect(
      startReview({ postId: id, userId: approver.id }),
    ).rejects.toThrow(WorkflowError);
  });
});

describe("approvePost", () => {
  it("approves an IN_REVIEW post and writes the historical action", async () => {
    const approver = await createUser("Approve Approver");
    const creator = await createUser("Approve Creator");
    const { postId, versionId } = await submittedPost(approver.id, creator.id);
    await startReview({ postId, userId: approver.id });
    const postBefore = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });

    const result = await approvePost({
      postId,
      userId: approver.id,
      input: {
        postVersionId: versionId,
        lockVersion: postBefore.lockVersion,
        comment: "Looks good.",
      },
    });

    expect(result.status).toBe("APPROVED");
    expect(result.approvedVersion).toBe(1);
    expect(result.approvedBy.id).toBe(approver.id);

    const postAfter = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(postAfter.status).toBe("APPROVED");
    expect(postAfter.approvedVersionId).toBe(versionId);

    const action = await prisma.approvalAction.findFirstOrThrow({
      where: { postId, action: "APPROVE" },
    });
    expect(action.comment).toBe("Looks good.");
    expect(action.postVersionId).toBe(versionId);

    const assignment = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId },
    });
    expect(assignment.status).toBe("COMPLETED");
  });

  it("refuses APPROVE from a post that hasn't started review", async () => {
    const approver = await createUser("Approve Submitted Approver");
    const creator = await createUser("Approve Submitted Creator");
    const { postId, versionId } = await submittedPost(approver.id, creator.id);
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    await expect(
      approvePost({
        postId,
        userId: approver.id,
        input: { postVersionId: versionId, lockVersion: post.lockVersion },
      }),
    ).rejects.toThrow(WorkflowError);
  });

  it("responds ALREADY_DECIDED when the decision targets a stale version", async () => {
    const approver = await createUser("Approve Stale Version Approver");
    const creator = await createUser("Approve Stale Version Creator");
    const { postId } = await submittedPost(approver.id, creator.id);
    await startReview({ postId, userId: approver.id });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    await expect(
      approvePost({
        postId,
        userId: approver.id,
        input: { postVersionId: randomUUID(), lockVersion: post.lockVersion },
      }),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("responds STALE_RESOURCE when lockVersion is stale", async () => {
    const approver = await createUser("Approve Stale Lock Approver");
    const creator = await createUser("Approve Stale Lock Creator");
    const { postId, versionId } = await submittedPost(approver.id, creator.id);
    await startReview({ postId, userId: approver.id });

    await expect(
      approvePost({
        postId,
        userId: approver.id,
        input: { postVersionId: versionId, lockVersion: 0 },
      }),
    ).rejects.toMatchObject({ code: "STALE_RESOURCE" });
  });

  it("a concurrent double-approve leaves exactly one approval", async () => {
    const approver = await createUser("Concurrent Approver");
    const creator = await createUser("Concurrent Creator");
    const { postId, versionId } = await submittedPost(approver.id, creator.id);
    await startReview({ postId, userId: approver.id });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    const attempt = () =>
      approvePost({
        postId,
        userId: approver.id,
        input: { postVersionId: versionId, lockVersion: post.lockVersion },
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const actions = await prisma.approvalAction.findMany({
      where: { postId, action: "APPROVE" },
    });
    expect(actions).toHaveLength(1);

    const postAfter = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(postAfter.status).toBe("APPROVED");
  });
});

describe("requestChanges", () => {
  it("requires a non-empty comment", async () => {
    const approver = await createUser("Request Changes Comment Approver");
    const creator = await createUser("Request Changes Comment Creator");
    const { postId, versionId } = await submittedPost(approver.id, creator.id);
    await startReview({ postId, userId: approver.id });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    await expect(
      requestChanges({
        postId,
        userId: approver.id,
        input: { postVersionId: versionId, lockVersion: post.lockVersion },
      }),
    ).rejects.toThrow(CommentRequiredError);

    await expect(
      requestChanges({
        postId,
        userId: approver.id,
        input: {
          postVersionId: versionId,
          lockVersion: post.lockVersion,
          comment: "   ",
        },
      }),
    ).rejects.toThrow(CommentRequiredError);
  });

  it("moves IN_REVIEW to CHANGES_REQUESTED with a comment", async () => {
    const approver = await createUser("Request Changes Approver");
    const creator = await createUser("Request Changes Creator");
    const { postId, versionId } = await submittedPost(approver.id, creator.id);
    await startReview({ postId, userId: approver.id });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    const result = await requestChanges({
      postId,
      userId: approver.id,
      input: {
        postVersionId: versionId,
        lockVersion: post.lockVersion,
        comment: "Fix the CTA colour.",
      },
    });
    expect(result.status).toBe("CHANGES_REQUESTED");

    const postAfter = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(postAfter.status).toBe("CHANGES_REQUESTED");

    const action = await prisma.approvalAction.findFirstOrThrow({
      where: { postId, action: "REQUEST_CHANGES" },
    });
    expect(action.comment).toBe("Fix the CTA colour.");
  });
});

describe("rejectPost", () => {
  it("requires a non-empty reason", async () => {
    const approver = await createUser("Reject Reason Approver");
    const creator = await createUser("Reject Reason Creator");
    const { postId, versionId } = await submittedPost(approver.id, creator.id);
    await startReview({ postId, userId: approver.id });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    await expect(
      rejectPost({
        postId,
        userId: approver.id,
        input: { postVersionId: versionId, lockVersion: post.lockVersion },
      }),
    ).rejects.toThrow(CommentRequiredError);
  });

  it("moves IN_REVIEW to REJECTED and stores the rejection reason", async () => {
    const approver = await createUser("Reject Approver");
    const creator = await createUser("Reject Creator");
    const { postId, versionId } = await submittedPost(approver.id, creator.id);
    await startReview({ postId, userId: approver.id });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    const result = await rejectPost({
      postId,
      userId: approver.id,
      input: {
        postVersionId: versionId,
        lockVersion: post.lockVersion,
        reason: "Off-brand tone.",
      },
    });
    expect(result.status).toBe("REJECTED");

    const postAfter = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(postAfter.status).toBe("REJECTED");
    expect(postAfter.rejectionReason).toBe("Off-brand tone.");

    const action = await prisma.approvalAction.findFirstOrThrow({
      where: { postId, action: "REJECT" },
    });
    expect(action.comment).toBe("Off-brand tone.");
  });
});

describe("cancelPost", () => {
  it("cancels a never-submitted DRAFT without an ApprovalAction row", async () => {
    const creator = await createUser("Cancel Draft Creator");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Cancel me" },
    });
    createdPostIds.push(id);

    const result = await cancelPost({
      postId: id,
      userId: creator.id,
      input: { lockVersion: 0 },
    });
    expect(result.status).toBe("CANCELLED");

    const post = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(post.status).toBe("CANCELLED");

    const actions = await prisma.approvalAction.findMany({
      where: { postId: id },
    });
    expect(actions).toHaveLength(0);
  });

  it("cancels a SUBMITTED post, completing its open assignment", async () => {
    const approver = await createUser("Cancel Submitted Approver");
    const creator = await createUser("Cancel Submitted Creator");
    const { postId } = await submittedPost(approver.id, creator.id);
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    const result = await cancelPost({
      postId,
      userId: creator.id,
      input: { lockVersion: post.lockVersion },
    });
    expect(result.status).toBe("CANCELLED");

    const postAfter = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(postAfter.status).toBe("CANCELLED");

    const assignment = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId },
    });
    expect(assignment.status).toBe("CANCELLED");

    const action = await prisma.approvalAction.findFirstOrThrow({
      where: { postId, action: "CANCEL" },
    });
    expect(action.postVersionId).toBe(post.currentVersionId);
  });

  it("refuses to cancel a post that is already IN_REVIEW", async () => {
    const approver = await createUser("Cancel In Review Approver");
    const creator = await createUser("Cancel In Review Creator");
    const { postId } = await submittedPost(approver.id, creator.id);
    await startReview({ postId, userId: approver.id });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

    await expect(
      cancelPost({
        postId,
        userId: creator.id,
        input: { lockVersion: post.lockVersion },
      }),
    ).rejects.toThrow(WorkflowError);
  });
});
