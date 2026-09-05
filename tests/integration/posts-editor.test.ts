import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  NotFoundError,
  NotReadyError,
  WorkflowError,
} from "@/server/http/handler";
import {
  createDraft,
  getPostForEdit,
  updateDraft,
  autosaveDraft,
  getReadiness,
  submitPost,
  EMPTY_DOCUMENT,
} from "@/modules/posts";
import type { TiptapDocument } from "@/modules/posts";

/**
 * Covers the Phase 8 editor backend against the real database: draft CRUD
 * with optimistic locking, the deterministic readiness checklist, and
 * submission (version freeze, status transition, route resolution,
 * assignment creation) — API.md's Posts endpoints and ARCHITECTURE.md's
 * Concurrency/Versioning rules.
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
      email: `editor-${randomUUID()}@editortest.local`,
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

/** A department + rule combo scoped to this test, matched first (low priorityOrder) regardless of pre-seeded rules. */
async function createRoutableDepartment(approverId: string) {
  const department = await prisma.department.create({
    data: { key: `editor-dept-${randomUUID()}`, name: "Editor Dept" },
  });
  createdDepartmentIds.push(department.id);
  const rule = await prisma.approvalRule.create({
    data: {
      name: `editor-rule-${randomUUID()}`,
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

const richContent: TiptapDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hello world, this is a real post." }],
    },
  ],
};

describe("createDraft / getPostForEdit", () => {
  it("creates a DRAFT with a generated reference and an empty document", async () => {
    const creator = await createUser("Editor Creator");
    const { id, reference } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "My first post" },
    });
    createdPostIds.push(id);

    expect(reference).toMatch(/^POST-\d{4}-\d{6}$/);

    const dto = await getPostForEdit(id, creator.id);
    expect(dto).toMatchObject({
      title: "My first post",
      status: "DRAFT",
      draftTitle: "My first post",
      draftContentJson: EMPTY_DOCUMENT,
      lockVersion: 0,
      capabilities: { canEdit: true, canSubmit: true },
      changesRequested: null,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Post", entityId: id, action: "POST_CREATED" },
    });
    expect(audit).not.toBeNull();
  });

  it("reports no edit/submit capability for someone else's draft", async () => {
    const creator = await createUser("Editor Owner");
    const other = await createUser("Editor Stranger");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Not yours" },
    });
    createdPostIds.push(id);

    const dto = await getPostForEdit(id, other.id);
    expect(dto?.capabilities).toEqual({ canEdit: false, canSubmit: false });
  });

  it("returns null for a post that doesn't exist", async () => {
    const dto = await getPostForEdit(randomUUID(), randomUUID());
    expect(dto).toBeNull();
  });
});

describe("updateDraft", () => {
  it("updates fields and increments lockVersion when it matches", async () => {
    const creator = await createUser("Editor Updater");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Draft title" },
    });
    createdPostIds.push(id);

    const result = await updateDraft({
      postId: id,
      input: {
        lockVersion: 0,
        title: "Updated title",
        contentJson: richContent,
        priority: "HIGH",
      },
    });
    expect(result.lockVersion).toBe(1);

    const dto = await getPostForEdit(id, creator.id);
    expect(dto?.title).toBe("Updated title");
    expect(dto?.priority).toBe("HIGH");
    expect(dto?.draftContentJson).toEqual(richContent);
    expect(dto?.lockVersion).toBe(1);
  });

  it("rejects a stale lockVersion with STALE_RESOURCE", async () => {
    const creator = await createUser("Editor Stale");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Draft" },
    });
    createdPostIds.push(id);

    await expect(
      updateDraft({ postId: id, input: { lockVersion: 5 } }),
    ).rejects.toMatchObject({
      code: "STALE_RESOURCE",
    } satisfies Partial<WorkflowError>);
  });

  it("throws NotFoundError for a post that doesn't exist", async () => {
    await expect(
      updateDraft({ postId: randomUUID(), input: { lockVersion: 0 } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("autosaveDraft", () => {
  it("saves the draft without requiring a lockVersion", async () => {
    const creator = await createUser("Editor Autosaver");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Draft" },
    });
    createdPostIds.push(id);

    const result = await autosaveDraft({
      postId: id,
      input: { title: "Autosaved title", contentJson: richContent },
    });
    expect(result.draftUpdatedAt).toBeTruthy();

    const dto = await getPostForEdit(id, creator.id);
    expect(dto?.draftTitle).toBe("Autosaved title");
    expect(dto?.draftContentJson).toEqual(richContent);
    // Autosave never touches lockVersion — only a real PATCH does.
    expect(dto?.lockVersion).toBe(0);
  });
});

describe("getReadiness", () => {
  it("fails every content/department/route item for a brand-new draft", async () => {
    const creator = await createUser("Editor Readiness Empty");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Draft" },
    });
    createdPostIds.push(id);

    const readiness = await getReadiness(id);
    expect(readiness.ready).toBe(false);
    const byKey = Object.fromEntries(
      readiness.items.map((i) => [i.key, i.passed]),
    );
    expect(byKey.title).toBe(true);
    expect(byKey.content).toBe(false);
    expect(byKey.attachments).toBe(true);
    expect(byKey.department).toBe(false);
    expect(byKey.route).toBe(false);
  });

  it("passes every item once title, content, department and a matching rule exist", async () => {
    const approver = await createUser("Editor Readiness Approver");
    const creator = await createUser("Editor Readiness Creator");
    const department = await createRoutableDepartment(approver.id);

    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Draft" },
    });
    createdPostIds.push(id);
    await updateDraft({
      postId: id,
      input: {
        lockVersion: 0,
        contentJson: richContent,
        departmentId: department.id,
      },
    });

    const readiness = await getReadiness(id);
    expect(readiness.ready).toBe(true);
    expect(readiness.items.every((i) => i.passed)).toBe(true);
  });
});

describe("submitPost", () => {
  it("freezes version 1, transitions to SUBMITTED and creates the assignment", async () => {
    const approver = await createUser("Editor Submit Approver");
    const creator = await createUser("Editor Submit Creator");
    const department = await createRoutableDepartment(approver.id);

    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Ready to submit" },
    });
    createdPostIds.push(id);
    await updateDraft({
      postId: id,
      input: {
        lockVersion: 0,
        contentJson: richContent,
        departmentId: department.id,
      },
    });

    const result = await submitPost({
      postId: id,
      input: { lockVersion: 1 },
    });
    expect(result.versionNumber).toBe(1);
    expect(result.assigneeName).toBe(approver.displayName);

    const post = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(post.status).toBe("SUBMITTED");
    expect(post.lockVersion).toBe(2);
    expect(post.currentVersionId).not.toBeNull();

    const version = await prisma.postVersion.findFirstOrThrow({
      where: { postId: id },
    });
    expect(version.versionNumber).toBe(1);
    expect(version.contentHtml).toContain("Hello world, this is a real post.");

    const assignment = await prisma.approvalAssignment.findFirstOrThrow({
      where: { postId: id },
    });
    expect(assignment.assigneeUserId).toBe(approver.id);
    expect(assignment.status).toBe("PENDING");

    const action = await prisma.approvalAction.findFirstOrThrow({
      where: { postId: id },
    });
    expect(action.action).toBe("SUBMIT");
    expect(action.previousStatus).toBe("DRAFT");
    expect(action.newStatus).toBe("SUBMITTED");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Post", entityId: id, action: "POST_SUBMITTED" },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects submission with a stale lockVersion", async () => {
    const approver = await createUser("Editor Stale Submit Approver");
    const creator = await createUser("Editor Stale Submit Creator");
    const department = await createRoutableDepartment(approver.id);
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "x" },
    });
    createdPostIds.push(id);
    await updateDraft({
      postId: id,
      input: {
        lockVersion: 0,
        contentJson: richContent,
        departmentId: department.id,
      },
    });

    await expect(
      submitPost({ postId: id, input: { lockVersion: 99 } }),
    ).rejects.toMatchObject({ code: "STALE_RESOURCE" });
  });

  it("refuses to submit a post that fails the readiness checklist", async () => {
    const creator = await createUser("Editor Not Ready Creator");
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "x" },
    });
    createdPostIds.push(id);

    const error = await submitPost({
      postId: id,
      input: { lockVersion: 0 },
    }).catch((e) => e);
    expect(error).toBeInstanceOf(NotReadyError);
    expect((error as NotReadyError).details.length).toBeGreaterThan(0);

    const post = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(post.status).toBe("DRAFT");
  });

  it("resubmission creates version 2, superseding version 1, via RESUBMIT", async () => {
    const approver = await createUser("Editor Resubmit Approver");
    const creator = await createUser("Editor Resubmit Creator");
    const department = await createRoutableDepartment(approver.id);
    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Round one" },
    });
    createdPostIds.push(id);
    await updateDraft({
      postId: id,
      input: {
        lockVersion: 0,
        contentJson: richContent,
        departmentId: department.id,
      },
    });
    await submitPost({ postId: id, input: { lockVersion: 1 } });

    // Simulate what Phase 11's REQUEST_CHANGES transition will do: the
    // open assignment completes and the post returns to CHANGES_REQUESTED.
    await prisma.approvalAssignment.updateMany({
      where: { postId: id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await prisma.post.update({
      where: { id },
      data: { status: "CHANGES_REQUESTED", lockVersion: { increment: 1 } },
    });
    const beforeResubmit = await prisma.post.findUniqueOrThrow({
      where: { id },
    });

    const result = await submitPost({
      postId: id,
      input: { lockVersion: beforeResubmit.lockVersion },
    });
    expect(result.versionNumber).toBe(2);

    const v2 = await prisma.postVersion.findFirstOrThrow({
      where: { postId: id, versionNumber: 2 },
    });
    const v1 = await prisma.postVersion.findFirstOrThrow({
      where: { postId: id, versionNumber: 1 },
    });
    expect(v2.supersedesVersionId).toBe(v1.id);

    const action = await prisma.approvalAction.findFirstOrThrow({
      where: { postId: id, postVersionId: v2.id },
    });
    expect(action.action).toBe("RESUBMIT");
    expect(action.previousStatus).toBe("CHANGES_REQUESTED");

    const post = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(post.status).toBe("SUBMITTED");
  });
});
