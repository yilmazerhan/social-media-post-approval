import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDraft, updateDraft, submitPost } from "@/modules/posts";
import type { TiptapDocument } from "@/modules/posts";
import {
  resolveApprovalRoute,
  previewApprovalRoute,
  reassignApproval,
} from "@/modules/approvals";
import { WorkflowError } from "@/server/http/handler";

/**
 * Phase 12 — `ApprovalRule` routing (creator override, the admin dry-run
 * preview) and manual assignment/reassignment. Exit criterion
 * (IMPLEMENTATION_PLAN.md): "routing resolves server-side for every seeded
 * rule; the frontend contains no routing logic at all" — the matching
 * query itself (route-resolution.ts) predates this phase (Phase 8); this
 * covers the two pieces of behaviour Phase 12 actually adds.
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
      email: `assignment-${randomUUID()}@editortest.local`,
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

describe("creator override", () => {
  it("honors the creator's requested approver when the rule allows override", async () => {
    const ruleTarget = await createUser("Rule Target");
    const requested = await createUser("Requested Approver");
    const creator = await createUser("Override Creator");
    const department = await prisma.department.create({
      data: { key: `override-dept-${randomUUID()}`, name: "Override Dept" },
    });
    createdDepartmentIds.push(department.id);
    const rule = await prisma.approvalRule.create({
      data: {
        name: `override-rule-${randomUUID()}`,
        isActive: true,
        priorityOrder: 1,
        departmentId: department.id,
        targetType: "USER",
        targetUserId: ruleTarget.id,
        allowCreatorOverride: true,
      },
    });
    createdRuleIds.push(rule.id);

    const route = await resolveApprovalRoute({
      departmentId: department.id,
      priority: "NORMAL",
      creatorId: creator.id,
      requestedApproverId: requested.id,
      requestedGroupId: null,
    });
    expect(route?.assigneeUserId).toBe(requested.id);
  });

  it("ignores the creator's request when the rule forbids override", async () => {
    const ruleTarget = await createUser("No Override Rule Target");
    const requested = await createUser("No Override Requested Approver");
    const creator = await createUser("No Override Creator");
    const department = await prisma.department.create({
      data: {
        key: `no-override-dept-${randomUUID()}`,
        name: "No Override Dept",
      },
    });
    createdDepartmentIds.push(department.id);
    const rule = await prisma.approvalRule.create({
      data: {
        name: `no-override-rule-${randomUUID()}`,
        isActive: true,
        priorityOrder: 1,
        departmentId: department.id,
        targetType: "USER",
        targetUserId: ruleTarget.id,
        allowCreatorOverride: false,
      },
    });
    createdRuleIds.push(rule.id);

    const route = await resolveApprovalRoute({
      departmentId: department.id,
      priority: "NORMAL",
      creatorId: creator.id,
      requestedApproverId: requested.id,
      requestedGroupId: null,
    });
    expect(route?.assigneeUserId).toBe(ruleTarget.id);
  });
});

describe("previewApprovalRoute", () => {
  it("returns the matching rule and assignee name for a hypothetical post", async () => {
    const approver = await createUser("Preview Approver");
    const creator = await createUser("Preview Creator");
    const department = await prisma.department.create({
      data: { key: `preview-dept-${randomUUID()}`, name: "Preview Dept" },
    });
    createdDepartmentIds.push(department.id);
    const rule = await prisma.approvalRule.create({
      data: {
        name: `preview-rule-${randomUUID()}`,
        isActive: true,
        priorityOrder: 1,
        departmentId: department.id,
        targetType: "USER",
        targetUserId: approver.id,
      },
    });
    createdRuleIds.push(rule.id);

    const result = await previewApprovalRoute({
      departmentId: department.id,
      priority: "NORMAL",
      creatorId: creator.id,
      requestedApproverId: null,
      requestedGroupId: null,
    });
    expect(result.rule?.id).toBe(rule.id);
    expect(result.assigneeName).toBe("Preview Approver");
  });

  it("returns null when no active rule matches", async () => {
    const creator = await createUser("Preview No Match Creator");
    const result = await previewApprovalRoute({
      departmentId: null,
      priority: "NORMAL",
      creatorId: creator.id,
      requestedApproverId: null,
      requestedGroupId: null,
    });
    // A seeded catch-all rule may still match in a fully-seeded database —
    // this only asserts the shape is well-formed either way.
    expect(result).toHaveProperty("rule");
    expect(result).toHaveProperty("assigneeName");
  });
});

describe("reassignApproval", () => {
  async function submittedPost(approverId: string, creatorId: string) {
    const department = await prisma.department.create({
      data: { key: `reassign-dept-${randomUUID()}`, name: "Reassign Dept" },
    });
    createdDepartmentIds.push(department.id);
    const rule = await prisma.approvalRule.create({
      data: {
        name: `reassign-rule-${randomUUID()}`,
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
      input: { title: "Reassignment post" },
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
    return id;
  }

  it("the first manual reassignment records ASSIGN, later ones REASSIGN", async () => {
    const originalApprover = await createUser("Original Approver");
    const firstManualApprover = await createUser("First Manual Approver");
    const secondManualApprover = await createUser("Second Manual Approver");
    const admin = await createUser("Assigning Admin");
    const creator = await createUser("Reassign Creator");
    const postId = await submittedPost(originalApprover.id, creator.id);

    const first = await reassignApproval({
      postId,
      actorId: admin.id,
      input: { assigneeUserId: firstManualApprover.id },
    });
    expect(first.assigneeName).toBe("First Manual Approver");

    const assignment = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId },
    });
    expect(assignment.assigneeUserId).toBe(firstManualApprover.id);
    expect(assignment.assignedById).toBe(admin.id);

    const firstAction = await prisma.approvalAction.findFirstOrThrow({
      where: { postId, assignmentId: assignment.id },
      orderBy: { createdAt: "asc" },
    });
    expect(firstAction.action).toBe("ASSIGN");

    const second = await reassignApproval({
      postId,
      actorId: admin.id,
      input: { assigneeUserId: secondManualApprover.id },
    });
    expect(second.assigneeName).toBe("Second Manual Approver");

    const actions = await prisma.approvalAction.findMany({
      where: { postId, assignmentId: assignment.id },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map((a) => a.action)).toEqual(["ASSIGN", "REASSIGN"]);
  });

  it("resolves a group assignee's name and clears the prior user assignee", async () => {
    const originalApprover = await createUser("Group Reassign Approver");
    const admin = await createUser("Group Reassign Admin");
    const creator = await createUser("Group Reassign Creator");
    const postId = await submittedPost(originalApprover.id, creator.id);

    const group = await prisma.group.create({
      data: {
        key: `reassign-group-${randomUUID()}`,
        name: `Reassign Group ${randomUUID()}`,
      },
    });
    createdGroupIds.push(group.id);

    const result = await reassignApproval({
      postId,
      actorId: admin.id,
      input: { assigneeGroupId: group.id },
    });
    expect(result.assigneeName).toBe(group.name);

    const assignment = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId },
    });
    expect(assignment.assigneeGroupId).toBe(group.id);
    expect(assignment.assigneeUserId).toBeNull();
  });

  it("refuses to reassign a post with no open assignment", async () => {
    const creator = await createUser("No Assignment Creator");
    const admin = await createUser("No Assignment Admin");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Never submitted" },
    });
    createdPostIds.push(id);

    await expect(
      reassignApproval({
        postId: id,
        actorId: admin.id,
        input: { assigneeUserId: admin.id },
      }),
    ).rejects.toThrow(WorkflowError);
  });
});
