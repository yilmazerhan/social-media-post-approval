import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDraft, updateDraft, submitPost } from "@/modules/posts";
import type { TiptapDocument } from "@/modules/posts";
import {
  startReview,
  getApprovalReviewPayload,
  getNextInQueue,
} from "@/modules/approvals";
import { loadAuthorizedUser } from "@/modules/authorization";

/**
 * Phase 14 — the Approval Review payload and the queue's keyboard-nav
 * "next" lookup.
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

async function createUser(
  displayName: string,
  roleKey: "EMPLOYEE" | "APPROVER" = "EMPLOYEE",
) {
  const user = await prisma.user.create({
    data: {
      email: `review-${randomUUID()}@editortest.local`,
      displayName,
      firstName: displayName,
      lastName: "Test",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
    },
  });
  createdUserIds.push(user.id);
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user;
}

function doc(text: string): TiptapDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function submittedPost(params: {
  approverId: string;
  creatorId: string;
}) {
  const department = await prisma.department.create({
    data: { key: `review-dept-${randomUUID()}`, name: "Review Dept" },
  });
  createdDepartmentIds.push(department.id);
  const rule = await prisma.approvalRule.create({
    data: {
      name: `review-rule-${randomUUID()}`,
      isActive: true,
      priorityOrder: 1,
      departmentId: department.id,
      targetType: "USER",
      targetUserId: params.approverId,
    },
  });
  createdRuleIds.push(rule.id);

  const { id } = await createDraft({
    creatorId: params.creatorId,
    creatorEmail: `${params.creatorId}@editortest.local`,
    input: { title: "Review post" },
  });
  createdPostIds.push(id);
  await updateDraft({
    postId: id,
    creatorId: params.creatorId,
    input: {
      lockVersion: 0,
      contentJson: doc("First version body."),
      departmentId: department.id,
    },
  });
  await submitPost({ postId: id, input: { lockVersion: 1 } });
  return id;
}

describe("getApprovalReviewPayload", () => {
  it("returns a full payload with no diff for a single-version post, canDecide true for the assignee", async () => {
    const approver = await createUser("Review Approver", "APPROVER");
    const creator = await createUser("Review Creator");
    const postId = await submittedPost({
      approverId: approver.id,
      creatorId: creator.id,
    });
    await startReview({ postId, userId: approver.id });

    const authz = await loadAuthorizedUser(approver.id);
    const payload = await getApprovalReviewPayload(postId, authz);
    if (!payload) throw new Error("expected a payload");

    expect(payload.header.status).toBe("IN_REVIEW");
    expect(payload.header.currentVersionNumber).toBe(1);
    expect(payload.header.assigneeName).toBe("Review Approver");
    expect(payload.header.capabilities.canDecide).toBe(true);
    expect(payload.diff).toBeNull();
    expect(payload.currentVersion.contentHtml).toContain("First version body.");
  });

  it("returns the previous→current diff once a second version exists", async () => {
    const approver = await createUser("Review Diff Approver", "APPROVER");
    const creator = await createUser("Review Diff Creator");
    const postId = await submittedPost({
      approverId: approver.id,
      creatorId: creator.id,
    });

    // Simulate Phase 11's REQUEST_CHANGES (already covered elsewhere) to
    // get back to a resubmittable state.
    await prisma.post.update({
      where: { id: postId },
      data: { status: "CHANGES_REQUESTED" },
    });
    await prisma.approvalAssignment.updateMany({
      where: { postId, status: { in: ["PENDING", "IN_PROGRESS"] } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await updateDraft({
      postId,
      creatorId: creator.id,
      input: { lockVersion: 2, contentJson: doc("Second version body.") },
    });
    await submitPost({ postId, input: { lockVersion: 3 } });
    await startReview({ postId, userId: approver.id });

    const authz = await loadAuthorizedUser(approver.id);
    const payload = await getApprovalReviewPayload(postId, authz);
    if (!payload) throw new Error("expected a payload");

    expect(payload.header.currentVersionNumber).toBe(2);
    expect(payload.diff).not.toBeNull();
    expect(
      payload.diff?.textDiff.some((s) => s.added && s.value.includes("Second")),
    ).toBe(true);
  });

  it("canDecide is false for the creator and for an unrelated approver", async () => {
    const approver = await createUser("Review Wrong Approver", "APPROVER");
    const creator = await createUser("Review Wrong Creator");
    const stranger = await createUser("Review Stranger Approver", "APPROVER");
    const postId = await submittedPost({
      approverId: approver.id,
      creatorId: creator.id,
    });
    await startReview({ postId, userId: approver.id });

    const creatorAuthz = await loadAuthorizedUser(creator.id);
    const asCreator = await getApprovalReviewPayload(postId, creatorAuthz);
    expect(asCreator?.header.capabilities.canDecide).toBe(false);

    const strangerAuthz = await loadAuthorizedUser(stranger.id);
    const asStranger = await getApprovalReviewPayload(postId, strangerAuthz);
    expect(asStranger?.header.capabilities.canDecide).toBe(false);
  });

  it("returns null for a post that was never submitted", async () => {
    const creator = await createUser("Review Draft Creator");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Never submitted" },
    });
    createdPostIds.push(id);

    const authz = await loadAuthorizedUser(creator.id);
    const payload = await getApprovalReviewPayload(id, authz);
    expect(payload).toBeNull();
  });
});

describe("getNextInQueue", () => {
  it("returns the next post in the caller's own queue, and null past the end", async () => {
    const approver = await createUser("Next Queue Approver", "APPROVER");
    const creator = await createUser("Next Queue Creator");
    const first = await submittedPost({
      approverId: approver.id,
      creatorId: creator.id,
    });
    const second = await submittedPost({
      approverId: approver.id,
      creatorId: creator.id,
    });

    // Both posts have a null dueAt, so ordering falls back to
    // assignedAt ascending — `first` was assigned strictly before
    // `second`, making the order deterministic.
    const authz = await loadAuthorizedUser(approver.id);
    const next = await getNextInQueue(authz, first);
    expect(next?.postId).toBe(second);

    const pastEnd = await getNextInQueue(authz, second);
    expect(pastEnd).toBeNull();

    const unknown = await getNextInQueue(authz, randomUUID());
    expect(unknown).toBeNull();
  });
});
