import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDraft, updateDraft, submitPost } from "@/modules/posts";
import type { TiptapDocument } from "@/modules/posts";
import { getApprovalQueue } from "@/modules/approvals";
import { loadAuthorizedUser } from "@/modules/authorization";

/**
 * Phase 13 — the queue listing. Exit criterion (IMPLEMENTATION_PLAN.md):
 * "filters and pagination correct; an approver sees only what they may
 * see."
 */

const createdPostIds: string[] = [];
const createdUserIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdGroupIds: string[] = [];
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

async function createUser(displayName: string) {
  const user = await prisma.user.create({
    data: {
      email: `queue-${randomUUID()}@editortest.local`,
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

function doc(text: string): TiptapDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function submittedPost(params: {
  approverId?: string;
  approverGroupId?: string;
  creatorId: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  title?: string;
}) {
  const department = await prisma.department.create({
    data: { key: `queue-dept-${randomUUID()}`, name: "Queue Dept" },
  });
  createdDepartmentIds.push(department.id);
  const rule = await prisma.approvalRule.create({
    data: {
      name: `queue-rule-${randomUUID()}`,
      isActive: true,
      priorityOrder: 1,
      departmentId: department.id,
      targetType: params.approverGroupId ? "GROUP" : "USER",
      targetUserId: params.approverGroupId ? null : params.approverId,
      targetGroupId: params.approverGroupId ?? null,
    },
  });
  createdRuleIds.push(rule.id);

  const { id } = await createDraft({
    creatorId: params.creatorId,
    creatorEmail: `${params.creatorId}@editortest.local`,
    input: { title: params.title ?? "Queue post" },
  });
  createdPostIds.push(id);
  await updateDraft({
    postId: id,
    creatorId: params.creatorId,
    input: {
      lockVersion: 0,
      contentJson: doc("Body."),
      departmentId: department.id,
      priority: params.priority,
    },
  });
  await submitPost({ postId: id, input: { lockVersion: 1 } });
  return id;
}

describe("getApprovalQueue", () => {
  it("shows only assignments routed to the caller, directly or via their group", async () => {
    const me = await createUser("Queue Me");
    const someoneElse = await createUser("Queue Someone Else");
    const creator = await createUser("Queue Creator");

    const mine = await submittedPost({
      approverId: me.id,
      creatorId: creator.id,
    });
    await submittedPost({ approverId: someoneElse.id, creatorId: creator.id });

    const authz = await loadAuthorizedUser(me.id);
    const result = await getApprovalQueue(authz, {});
    expect(result.items.map((r) => r.postId)).toEqual([mine]);
  });

  it("includes assignments routed to the caller's group", async () => {
    const me = await createUser("Queue Group Me");
    const creator = await createUser("Queue Group Creator");
    const group = await prisma.group.create({
      data: { key: `queue-group-${randomUUID()}`, name: "Queue Group" },
    });
    createdGroupIds.push(group.id);
    await prisma.userGroup.create({
      data: { userId: me.id, groupId: group.id },
    });

    const groupPost = await submittedPost({
      approverGroupId: group.id,
      creatorId: creator.id,
    });

    const authz = await loadAuthorizedUser(me.id);
    const result = await getApprovalQueue(authz, {});
    expect(result.items.map((r) => r.postId)).toContain(groupPost);
    expect(result.items[0].assigneeKind).toBe("GROUP");
  });

  it("filters by priority and department", async () => {
    const me = await createUser("Queue Filter Me");
    const creator = await createUser("Queue Filter Creator");

    const urgentPost = await submittedPost({
      approverId: me.id,
      creatorId: creator.id,
      priority: "URGENT",
    });
    await submittedPost({
      approverId: me.id,
      creatorId: creator.id,
      priority: "LOW",
    });

    const authz = await loadAuthorizedUser(me.id);
    const result = await getApprovalQueue(authz, { priority: "URGENT" });
    expect(result.items.map((r) => r.postId)).toEqual([urgentPost]);

    const urgentPostRow = await prisma.post.findUniqueOrThrow({
      where: { id: urgentPost },
      select: { departmentId: true },
    });
    if (!urgentPostRow.departmentId) {
      throw new Error("expected the queue post to have a department");
    }
    const byDept = await getApprovalQueue(authz, {
      departmentId: urgentPostRow.departmentId,
    });
    expect(byDept.items.map((r) => r.postId)).toEqual([urgentPost]);
  });

  it("filters overdue, dueToday and unassigned correctly", async () => {
    const me = await createUser("Queue Due Me");
    const creator = await createUser("Queue Due Creator");
    const group = await prisma.group.create({
      data: { key: `queue-due-group-${randomUUID()}`, name: "Queue Due Group" },
    });
    createdGroupIds.push(group.id);
    await prisma.userGroup.create({
      data: { userId: me.id, groupId: group.id },
    });

    // Routed to the group, not directly to `me` — assigneeUserId is null
    // by construction, which is exactly what "unassigned" (nobody has
    // personally picked this up yet) means.
    const overduePost = await submittedPost({
      approverGroupId: group.id,
      creatorId: creator.id,
    });
    const dueTodayPost = await submittedPost({
      approverId: me.id,
      creatorId: creator.id,
    });
    const futurePost = await submittedPost({
      approverId: me.id,
      creatorId: creator.id,
    });

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const laterToday = new Date(now.getTime() + 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await prisma.approvalAssignment.updateMany({
      where: { postId: overduePost },
      data: { dueAt: yesterday },
    });
    await prisma.approvalAssignment.updateMany({
      where: { postId: dueTodayPost },
      data: { dueAt: laterToday },
    });
    await prisma.approvalAssignment.updateMany({
      where: { postId: futurePost },
      data: { dueAt: nextWeek },
    });

    const authz = await loadAuthorizedUser(me.id);

    const overdue = await getApprovalQueue(authz, { overdue: true });
    expect(overdue.items.map((r) => r.postId)).toEqual([overduePost]);

    const dueToday = await getApprovalQueue(authz, { dueToday: true });
    expect(dueToday.items.map((r) => r.postId)).toEqual([dueTodayPost]);

    const unassigned = await getApprovalQueue(authz, { unassigned: true });
    expect(unassigned.items.map((r) => r.postId)).toEqual([overduePost]);
  });

  it("paginates correctly", async () => {
    const me = await createUser("Queue Page Me");
    const creator = await createUser("Queue Page Creator");
    for (let i = 0; i < 3; i += 1) {
      await submittedPost({
        approverId: me.id,
        creatorId: creator.id,
        title: `Page post ${i}`,
      });
    }

    const authz = await loadAuthorizedUser(me.id);
    const firstPage = await getApprovalQueue(authz, { page: 1, pageSize: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBe(3);

    const secondPage = await getApprovalQueue(authz, { page: 2, pageSize: 2 });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.total).toBe(3);

    const combinedIds = new Set([
      ...firstPage.items.map((r) => r.postId),
      ...secondPage.items.map((r) => r.postId),
    ]);
    expect(combinedIds.size).toBe(3);
  });
});
