import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDraft, updateDraft, submitPost } from "@/modules/posts";
import type { TiptapDocument } from "@/modules/posts";
import { resolveSlaPolicy } from "@/modules/sla";
// Side-effect import: registers SLA_CHECK/SLA_ESCALATE, mirroring
// src/jobs/worker.ts's own wiring.
import "@/modules/sla/jobs";
import { runClaimedJob } from "@/jobs/queue";

/**
 * Phase 19 — SLA policy resolution, due/warning computation at submit
 * time, and the SLA_CHECK/SLA_ESCALATE jobs. Exit criterion
 * (IMPLEMENTATION_PLAN.md): warning at 75% and overdue at 100% each fire
 * once; an expired SLA never changes a post's status.
 */

const createdPostIds: string[] = [];
const createdUserIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdRuleIds: string[] = [];
const createdSlaPolicyIds: string[] = [];

afterAll(async () => {
  if (createdPostIds.length) {
    await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  }
  if (createdRuleIds.length) {
    await prisma.approvalRule.deleteMany({
      where: { id: { in: createdRuleIds } },
    });
  }
  if (createdSlaPolicyIds.length) {
    await prisma.slaPolicy.deleteMany({
      where: { id: { in: createdSlaPolicyIds } },
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
      email: `sla-${randomUUID()}@editortest.local`,
      displayName,
      firstName: displayName,
      lastName: "Test",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
    },
  });
  createdUserIds.push(user.id);
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: "EMPLOYEE" },
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

async function submittedPostWithPolicy(
  approverId: string,
  creatorId: string,
  policy: { durationMinutes: number; escalationAfterMinutes?: number },
) {
  const department = await prisma.department.create({
    data: { key: `sla-dept-${randomUUID()}`, name: "SLA Dept" },
  });
  createdDepartmentIds.push(department.id);
  const rule = await prisma.approvalRule.create({
    data: {
      name: `sla-rule-${randomUUID()}`,
      isActive: true,
      priorityOrder: 1,
      departmentId: department.id,
      targetType: "USER",
      targetUserId: approverId,
    },
  });
  createdRuleIds.push(rule.id);
  const slaPolicy = await prisma.slaPolicy.create({
    data: {
      name: `sla-policy-${randomUUID()}`,
      departmentId: department.id,
      priority: "NORMAL",
      durationMinutes: policy.durationMinutes,
      warningThresholdPercent: 75,
      escalationAfterMinutes: policy.escalationAfterMinutes,
      isActive: true,
    },
  });
  createdSlaPolicyIds.push(slaPolicy.id);

  const { id } = await createDraft({
    creatorId,
    creatorEmail: `${creatorId}@editortest.local`,
    input: { title: "SLA post" },
  });
  createdPostIds.push(id);
  await updateDraft({
    postId: id,
    creatorId,
    input: {
      lockVersion: 0,
      contentJson: doc("Body."),
      departmentId: department.id,
      priority: "NORMAL",
    },
  });
  await submitPost({ postId: id, input: { lockVersion: 1 } });
  return { postId: id, slaPolicyId: slaPolicy.id };
}

describe("SLA policy resolution and due-date computation at submit", () => {
  it("resolves the department+priority policy and sets dueAt/warningAt on the assignment and Post", async () => {
    const approver = await createUser("SLA Submit Approver");
    const creator = await createUser("SLA Submit Creator");
    const { postId, slaPolicyId } = await submittedPostWithPolicy(
      approver.id,
      creator.id,
      { durationMinutes: 120 },
    );

    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(post.slaPolicyId).toBe(slaPolicyId);
    expect(post.dueAt).not.toBeNull();

    const assignment = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId },
    });
    if (!assignment.dueAt)
      throw new Error("expected assignment.dueAt to be set");
    if (!post.dueAt) throw new Error("expected post.dueAt to be set");
    expect(assignment.warningAt).not.toBeNull();
    expect(assignment.dueAt.getTime() - assignment.assignedAt.getTime()).toBe(
      120 * 60_000,
    );
    expect(post.dueAt.getTime()).toBe(assignment.dueAt.getTime());
  });

  it("falls back to the priority-only seeded policy when no department+priority policy matches", async () => {
    // No department+priority policy exists for a random department, so this
    // must fall through to the seeded priority-only policy (bootstrap's
    // "sla-normal") rather than the department-specific one.
    const resolved = await resolveSlaPolicy({
      departmentId: randomUUID(),
      priority: "NORMAL",
    });
    expect(resolved?.departmentId).toBeNull();
    expect(resolved?.priority).toBe("NORMAL");
  });
});

describe("SLA_CHECK", () => {
  it("fires SLA_WARNING exactly once when past the warning threshold but not yet due", async () => {
    const approver = await createUser("SLA Warning Approver");
    const creator = await createUser("SLA Warning Creator");
    const { postId } = await submittedPostWithPolicy(approver.id, creator.id, {
      durationMinutes: 120,
    });

    const now = new Date();
    await prisma.approvalAssignment.updateMany({
      where: { postId },
      data: {
        warningAt: new Date(now.getTime() - 60_000),
        dueAt: new Date(now.getTime() + 60_000),
      },
    });

    const statusBefore = (
      await prisma.post.findUniqueOrThrow({ where: { id: postId } })
    ).status;

    const job = await prisma.backgroundJob.create({
      data: { type: "SLA_CHECK", payload: {} },
    });
    await runClaimedJob(job);
    await runClaimedJob(job);

    const notifications = await prisma.notification.findMany({
      where: { type: "SLA_WARNING", postId },
    });
    expect(notifications).toHaveLength(1);

    const postAfter = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(postAfter.status).toBe(statusBefore);
  });

  it("fires SLA_OVERDUE exactly once past the due date, and never changes the post's status", async () => {
    const approver = await createUser("SLA Overdue Approver");
    const creator = await createUser("SLA Overdue Creator");
    const { postId } = await submittedPostWithPolicy(approver.id, creator.id, {
      durationMinutes: 120,
    });

    const now = new Date();
    await prisma.approvalAssignment.updateMany({
      where: { postId },
      data: {
        warningAt: new Date(now.getTime() - 120_000),
        dueAt: new Date(now.getTime() - 60_000),
      },
    });
    const statusBefore = (
      await prisma.post.findUniqueOrThrow({ where: { id: postId } })
    ).status;

    const job = await prisma.backgroundJob.create({
      data: { type: "SLA_CHECK", payload: {} },
    });
    await runClaimedJob(job);
    await runClaimedJob(job);

    const notifications = await prisma.notification.findMany({
      where: { type: "SLA_OVERDUE", postId },
    });
    expect(notifications).toHaveLength(1);

    const postAfter = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(postAfter.status).toBe(statusBefore);
    const assignmentAfter = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId },
    });
    expect(assignmentAfter.status).toBe("PENDING");
  });

  it("escalates once to the configured target after escalationAfterMinutes, and does not escalate twice", async () => {
    const approver = await createUser("SLA Escalate Approver");
    const escalationTarget = await createUser("SLA Escalate Target");
    const creator = await createUser("SLA Escalate Creator");
    const { postId } = await submittedPostWithPolicy(approver.id, creator.id, {
      durationMinutes: 60,
      escalationAfterMinutes: 60,
    });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    if (!post.slaPolicyId)
      throw new Error("expected post.slaPolicyId to be set");
    await prisma.slaPolicy.update({
      where: { id: post.slaPolicyId },
      data: {
        escalationTargetType: "USER",
        escalationUserId: escalationTarget.id,
      },
    });

    const now = new Date();
    await prisma.approvalAssignment.updateMany({
      where: { postId },
      data: {
        assignedAt: new Date(now.getTime() - 2 * 60 * 60_000),
        warningAt: new Date(now.getTime() - 2 * 60 * 60_000),
        dueAt: new Date(now.getTime() - 60 * 60_000),
      },
    });

    const assignmentBefore = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId },
    });

    const checkJob = await prisma.backgroundJob.create({
      data: { type: "SLA_CHECK", payload: {} },
    });
    await runClaimedJob(checkJob);

    const escalateJob = await prisma.backgroundJob.findFirstOrThrow({
      where: {
        type: "SLA_ESCALATE",
        payload: { path: ["assignmentId"], equals: assignmentBefore.id },
      },
    });
    await runClaimedJob(escalateJob);
    // A second SLA_CHECK tick must not enqueue a second escalation.
    const secondCheckJob = await prisma.backgroundJob.create({
      data: { type: "SLA_CHECK", payload: {} },
    });
    await runClaimedJob(secondCheckJob);

    const escalateJobs = await prisma.backgroundJob.findMany({
      where: {
        type: "SLA_ESCALATE",
        payload: { path: ["assignmentId"], equals: assignmentBefore.id },
      },
    });
    expect(escalateJobs).toHaveLength(1);

    const assignmentAfter = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId },
    });
    expect(assignmentAfter.escalationLevel).toBe(1);
    expect(assignmentAfter.escalatedAt).not.toBeNull();

    const escalationNotification = await prisma.notification.findFirst({
      where: { type: "ESCALATION", postId, recipientId: escalationTarget.id },
    });
    expect(escalationNotification).not.toBeNull();
  });
});
