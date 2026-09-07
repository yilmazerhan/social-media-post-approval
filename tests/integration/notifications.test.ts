import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDraft, updateDraft, submitPost } from "@/modules/posts";
import type { TiptapDocument } from "@/modules/posts";
import {
  approvePost,
  rejectPost,
  requestChanges,
  startReview,
  reassignApproval,
} from "@/modules/approvals";
import { createComment } from "@/modules/comments";
import {
  writeNotification,
  enqueueGroupFanout,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  getPreferences,
  updatePreferences,
} from "@/modules/notifications";
// Side-effect import: registers the NOTIFICATION_FANOUT handler this test
// exercises directly, mirroring how src/jobs/worker.ts wires it up.
import "@/modules/notifications/jobs";
import { runClaimedJob } from "@/jobs/queue";
import { NotFoundError } from "@/server/http/handler";

/**
 * Phase 16 — notifications. Exit criterion (IMPLEMENTATION_PLAN.md): each of
 * the 7 workflow-event types fires exactly once per event, a per-type
 * preference opt-out suppresses the write, and a group-routed assignment's
 * fanout job expands to one row per member.
 */

const createdPostIds: string[] = [];
const createdUserIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdRuleIds: string[] = [];
const createdGroupIds: string[] = [];

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
  if (createdGroupIds.length) {
    await prisma.group.deleteMany({ where: { id: { in: createdGroupIds } } });
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
  opts: { roleKey?: "EMPLOYEE" | "APPROVER"; departmentId?: string } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `notif-${randomUUID()}@editortest.local`,
      displayName,
      firstName: displayName,
      lastName: "Test",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
      departmentId: opts.departmentId ?? null,
    },
  });
  createdUserIds.push(user.id);
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: opts.roleKey ?? "EMPLOYEE" },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user;
}

function doc(text: string): TiptapDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function submittedPostForApprover(approverId: string, creatorId: string) {
  const department = await prisma.department.create({
    data: { key: `notif-dept-${randomUUID()}`, name: "Notifications Dept" },
  });
  createdDepartmentIds.push(department.id);
  const rule = await prisma.approvalRule.create({
    data: {
      name: `notif-rule-${randomUUID()}`,
      isActive: true,
      priorityOrder: 1,
      departmentId: department.id,
      targetType: "USER",
      targetUserId: approverId,
    },
  });
  createdRuleIds.push(rule.id);

  const { id } = await createDraft({
    creatorId,
    creatorEmail: `${creatorId}@editortest.local`,
    input: { title: "Notifications post" },
  });
  createdPostIds.push(id);
  await updateDraft({
    postId: id,
    creatorId,
    input: {
      lockVersion: 0,
      contentJson: doc("Body."),
      departmentId: department.id,
    },
  });
  const result = await submitPost({ postId: id, input: { lockVersion: 1 } });
  return { postId: id, versionNumber: result.versionNumber };
}

describe("writeNotification", () => {
  it("writes a row by default, and skips when the recipient opted out", async () => {
    const user = await createUser("Notif Prefs User");

    await writeNotification({
      recipientId: user.id,
      type: "POST_SUBMITTED",
      title: "Test",
      body: "Test body",
      entityType: "Post",
      entityId: randomUUID(),
    });
    expect(await getUnreadCount(user.id)).toBe(1);

    await updatePreferences(user.id, [
      { type: "POST_SUBMITTED", inAppEnabled: false },
    ]);
    await writeNotification({
      recipientId: user.id,
      type: "POST_SUBMITTED",
      title: "Test 2",
      body: "Test body 2",
      entityType: "Post",
      entityId: randomUUID(),
    });
    expect(await getUnreadCount(user.id)).toBe(1);
  });
});

describe("enqueueGroupFanout", () => {
  it("expands group membership into one notification per member", async () => {
    const group = await prisma.group.create({
      data: { key: `notif-group-${randomUUID()}`, name: "Notif Group" },
    });
    createdGroupIds.push(group.id);
    const memberA = await createUser("Notif Group Member A");
    const memberB = await createUser("Notif Group Member B");
    await prisma.userGroup.createMany({
      data: [
        { userId: memberA.id, groupId: group.id },
        { userId: memberB.id, groupId: group.id },
      ],
    });

    await enqueueGroupFanout({
      groupId: group.id,
      type: "APPROVAL_ASSIGNED",
      title: "Approval needed",
      body: "Please review.",
      entityType: "Post",
      entityId: randomUUID(),
    });

    // Other integration test files also enqueue NOTIFICATION_FANOUT jobs
    // (any group-routed submission), and vitest runs test files in
    // parallel against the same shared test database — `claimNextJob`
    // drains the queue in FIFO order across ALL of them, so it isn't
    // safe to assume it returns *this* test's own job. Look this job up
    // directly by the groupId only this test used instead.
    const job = await prisma.backgroundJob.findFirstOrThrow({
      where: {
        type: "NOTIFICATION_FANOUT",
        payload: { path: ["groupId"], equals: group.id },
      },
    });
    await runClaimedJob(job);

    expect(await getUnreadCount(memberA.id)).toBe(1);
    expect(await getUnreadCount(memberB.id)).toBe(1);

    const completed = await prisma.backgroundJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(completed.status).toBe("SUCCEEDED");
  });
});

describe("listNotifications / getUnreadCount / markRead / markAllRead", () => {
  it("filters, marks read (idempotently), and marks all read", async () => {
    const user = await createUser("Notif List User");
    await writeNotification({
      recipientId: user.id,
      type: "COMMENT_MENTION",
      title: "Mentioned",
      body: "You were mentioned.",
      entityType: "Comment",
      entityId: randomUUID(),
    });
    await writeNotification({
      recipientId: user.id,
      type: "POST_APPROVED",
      title: "Approved",
      body: "Your post was approved.",
      entityType: "Post",
      entityId: randomUUID(),
    });

    const all = await listNotifications(user.id, "all");
    expect(all).toHaveLength(2);
    const mentions = await listNotifications(user.id, "mentions");
    expect(mentions).toHaveLength(1);
    expect(mentions[0].type).toBe("COMMENT_MENTION");

    expect(await getUnreadCount(user.id)).toBe(2);
    await markRead(all[0].id, user.id);
    // Marking the same notification read twice is a no-op success, not an error.
    await markRead(all[0].id, user.id);
    expect(await getUnreadCount(user.id)).toBe(1);

    await expect(markRead(randomUUID(), user.id)).rejects.toThrow(
      NotFoundError,
    );

    await markAllRead(user.id);
    expect(await getUnreadCount(user.id)).toBe(0);
  });
});

describe("getPreferences / updatePreferences", () => {
  it("defaults both channels to true, and upserts partial updates", async () => {
    const user = await createUser("Notif Preferences User");
    const defaults = await getPreferences(user.id);
    expect(defaults).toHaveLength(10);
    expect(defaults.every((p) => p.inAppEnabled && p.emailEnabled)).toBe(true);

    const updated = await updatePreferences(user.id, [
      { type: "COMMENT_ADDED", emailEnabled: false },
    ]);
    const commentAdded = updated.find((p) => p.type === "COMMENT_ADDED");
    expect(commentAdded).toEqual({
      type: "COMMENT_ADDED",
      inAppEnabled: true,
      emailEnabled: false,
    });
  });
});

describe("workflow-event notifications fire exactly once per event", () => {
  it("submit fires POST_SUBMITTED and APPROVAL_ASSIGNED", async () => {
    const approver = await createUser("Notif Submit Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Notif Submit Creator");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    const submitted = await prisma.notification.findMany({
      where: { postId, type: "POST_SUBMITTED", recipientId: creator.id },
    });
    expect(submitted).toHaveLength(1);
    const assigned = await prisma.notification.findMany({
      where: { postId, type: "APPROVAL_ASSIGNED", recipientId: approver.id },
    });
    expect(assigned).toHaveLength(1);
  });

  it("approve fires POST_APPROVED exactly once", async () => {
    const approver = await createUser("Notif Approve Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Notif Approve Creator");
    const { postId, versionNumber } = await submittedPostForApprover(
      approver.id,
      creator.id,
    );
    await startReview({ postId, userId: approver.id });
    const version = await prisma.postVersion.findFirstOrThrow({
      where: { postId, versionNumber },
    });
    const postBefore = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    await approvePost({
      postId,
      userId: approver.id,
      input: { postVersionId: version.id, lockVersion: postBefore.lockVersion },
    });

    const approved = await prisma.notification.findMany({
      where: { postId, type: "POST_APPROVED", recipientId: creator.id },
    });
    expect(approved).toHaveLength(1);
  });

  it("request-changes fires CHANGES_REQUESTED exactly once", async () => {
    const approver = await createUser("Notif Changes Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Notif Changes Creator");
    const { postId, versionNumber } = await submittedPostForApprover(
      approver.id,
      creator.id,
    );
    await startReview({ postId, userId: approver.id });
    const version = await prisma.postVersion.findFirstOrThrow({
      where: { postId, versionNumber },
    });
    const postBefore = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    await requestChanges({
      postId,
      userId: approver.id,
      input: {
        postVersionId: version.id,
        lockVersion: postBefore.lockVersion,
        comment: "Please tighten the second paragraph.",
      },
    });

    const notifications = await prisma.notification.findMany({
      where: { postId, type: "CHANGES_REQUESTED", recipientId: creator.id },
    });
    expect(notifications).toHaveLength(1);
  });

  it("reject fires POST_REJECTED exactly once", async () => {
    const approver = await createUser("Notif Reject Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Notif Reject Creator");
    const { postId, versionNumber } = await submittedPostForApprover(
      approver.id,
      creator.id,
    );
    await startReview({ postId, userId: approver.id });
    const version = await prisma.postVersion.findFirstOrThrow({
      where: { postId, versionNumber },
    });
    const postBefore = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    await rejectPost({
      postId,
      userId: approver.id,
      input: {
        postVersionId: version.id,
        lockVersion: postBefore.lockVersion,
        reason: "Doesn't meet brand guidelines.",
      },
    });

    const notifications = await prisma.notification.findMany({
      where: { postId, type: "POST_REJECTED", recipientId: creator.id },
    });
    expect(notifications).toHaveLength(1);
  });

  it("reassignment fires APPROVAL_ASSIGNED for the new assignee exactly once", async () => {
    const approver = await createUser("Notif Reassign Approver", {
      roleKey: "APPROVER",
    });
    const newApprover = await createUser("Notif Reassign New Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Notif Reassign Creator");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    await reassignApproval({
      postId,
      actorId: approver.id,
      input: { assigneeUserId: newApprover.id },
    });

    const notifications = await prisma.notification.findMany({
      where: {
        postId,
        type: "APPROVAL_ASSIGNED",
        recipientId: newApprover.id,
      },
    });
    expect(notifications).toHaveLength(1);
  });

  it("a comment notifies the post's creator via COMMENT_ADDED, but not the comment's own author", async () => {
    const approver = await createUser("Notif Comment Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Notif Comment Creator");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    await createComment({
      postId,
      authorId: approver.id,
      authorName: approver.displayName,
      input: { body: "Looks good overall." },
    });

    const creatorNotified = await prisma.notification.findMany({
      where: { postId, type: "COMMENT_ADDED", recipientId: creator.id },
    });
    expect(creatorNotified).toHaveLength(1);
    const authorNotified = await prisma.notification.findMany({
      where: { postId, type: "COMMENT_ADDED", recipientId: approver.id },
    });
    expect(authorNotified).toHaveLength(0);
  });
});
