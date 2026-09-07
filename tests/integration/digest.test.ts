import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDraft, updateDraft, submitPost } from "@/modules/posts";
import type { TiptapDocument } from "@/modules/posts";
import { runDailyDigest } from "@/modules/digest";

/**
 * Phase 18 — one consolidated digest per approver with pending work,
 * none for approvers without any, and a repeated run for the same day
 * doesn't double-send (idempotencyKey `digest:<date>:<userId>`,
 * `sendTemplatedEmail`'s own dedup — proven directly in
 * tests/integration/email.test.ts, exercised end-to-end here).
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
      email: `digest-${randomUUID()}@editortest.local`,
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

async function submittedPostForApprover(approverId: string, creatorId: string) {
  const department = await prisma.department.create({
    data: { key: `digest-dept-${randomUUID()}`, name: "Digest Dept" },
  });
  createdDepartmentIds.push(department.id);
  const rule = await prisma.approvalRule.create({
    data: {
      name: `digest-rule-${randomUUID()}`,
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
    input: { title: "Digest post" },
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
  await submitPost({ postId: id, input: { lockVersion: 1 } });
  return { postId: id };
}

describe("runDailyDigest", () => {
  it("sends one digest to an approver with pending work, and none to one without", async () => {
    const approver = await createUser("Digest Approver");
    const idleApprover = await createUser("Digest Idle Approver");
    const creator = await createUser("Digest Creator");
    await submittedPostForApprover(approver.id, creator.id);

    const result = await runDailyDigest();
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const log = await prisma.emailLog.findFirstOrThrow({
      where: { templateKey: "daily_digest", toAddress: approver.email },
    });
    expect(log.subject).toContain("1");

    const idleLog = await prisma.emailLog.findFirst({
      where: { templateKey: "daily_digest", toAddress: idleApprover.email },
    });
    expect(idleLog).toBeNull();
  });

  it("does not double-send the same approver's digest for the same day", async () => {
    const approver = await createUser("Digest Repeat Approver");
    const creator = await createUser("Digest Repeat Creator");
    await submittedPostForApprover(approver.id, creator.id);

    const now = new Date();
    await runDailyDigest(now);
    await runDailyDigest(now);

    const logs = await prisma.emailLog.findMany({
      where: { templateKey: "daily_digest", toAddress: approver.email },
    });
    expect(logs).toHaveLength(1);
  });
});
