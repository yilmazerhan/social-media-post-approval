import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  createDraft,
  updateDraft,
  submitPost,
  getPostDetail,
  listVersions,
  getVersion,
  compareVersions,
  getActivity,
} from "@/modules/posts";
import type { TiptapDocument } from "@/modules/posts";

/**
 * Phase 10 — version list/detail/compare/activity, and the one real new
 * mechanism this phase adds: editing an APPROVED post moves it back to
 * DRAFT (ARCHITECTURE.md §4) while gapless version numbering and the
 * historical ApprovalAction survive untouched.
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
      email: `versions-${randomUUID()}@editortest.local`,
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
    data: { key: `versions-dept-${randomUUID()}`, name: "Versions Dept" },
  });
  createdDepartmentIds.push(department.id);
  const rule = await prisma.approvalRule.create({
    data: {
      name: `versions-rule-${randomUUID()}`,
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

describe("versions: list, detail, compare, activity", () => {
  it("produces gapless version numbers with correct lineage across a resubmission", async () => {
    const approver = await createUser("Versions Approver");
    const creator = await createUser("Versions Creator");
    const department = await createRoutableDepartment(approver.id);

    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Multi-version post" },
    });
    createdPostIds.push(id);

    await updateDraft({
      postId: id,
      creatorId: creator.id,
      input: {
        lockVersion: 0,
        contentJson: doc("First draft of the body."),
        departmentId: department.id,
      },
    });
    const first = await submitPost({ postId: id, input: { lockVersion: 1 } });
    expect(first.versionNumber).toBe(1);

    // Simulate Phase 11's REQUEST_CHANGES (not built yet) putting the
    // post back into an editable, resubmittable state — including
    // completing the open assignment, since only one PENDING/IN_PROGRESS
    // assignment is ever allowed per post.
    await prisma.post.update({
      where: { id },
      data: { status: "CHANGES_REQUESTED" },
    });
    await prisma.approvalAssignment.updateMany({
      where: { postId: id, status: { in: ["PENDING", "IN_PROGRESS"] } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await updateDraft({
      postId: id,
      creatorId: creator.id,
      input: { lockVersion: 2, contentJson: doc("Second, revised body.") },
    });
    const second = await submitPost({ postId: id, input: { lockVersion: 3 } });
    expect(second.versionNumber).toBe(2);

    const versions = await listVersions(id);
    expect(versions.map((v) => v.versionNumber)).toEqual([2, 1]);

    const v1 = versions.find((v) => v.versionNumber === 1);
    const v2 = versions.find((v) => v.versionNumber === 2);
    if (!v1 || !v2) throw new Error("expected both versions to exist");

    const version2Row = await prisma.postVersion.findUniqueOrThrow({
      where: { id: v2.id },
    });
    expect(version2Row.supersedesVersionId).toBe(v1.id);

    const detail = await getVersion(id, v2.id);
    expect(detail.contentHtml).toContain("Second, revised body.");

    const compare = await compareVersions(id, v1.id, v2.id);
    expect(
      compare.textDiff.some((s) => s.removed && s.value.includes("First")),
    ).toBe(true);
    expect(
      compare.textDiff.some((s) => s.added && s.value.includes("Second")),
    ).toBe(true);

    const activity = await getActivity(id);
    const versionEntries = activity.filter((e) => e.type === "VERSION_CREATED");
    expect(versionEntries).toHaveLength(2);
  });
});

describe("editing an APPROVED post", () => {
  it("moves the post back to DRAFT, clears approvedVersionId, and keeps the historical ApprovalAction intact", async () => {
    const approver = await createUser("Approved Edit Approver");
    const creator = await createUser("Approved Edit Creator");
    const department = await createRoutableDepartment(approver.id);

    const { id } = await createDraft({
      creatorId: creator.id,
      creatorEmail: creator.email,
      input: { title: "Approved then edited" },
    });
    createdPostIds.push(id);

    await updateDraft({
      postId: id,
      creatorId: creator.id,
      input: {
        lockVersion: 0,
        contentJson: doc("Original approved content."),
        departmentId: department.id,
      },
    });
    await submitPost({ postId: id, input: { lockVersion: 1 } });

    // Simulate Phase 11's APPROVE action (not built yet): status flips to
    // APPROVED, approvedVersionId is set, and a real historical
    // ApprovalAction row is written the same way submitPost's own writes
    // are — this is what "the historical approval row survives" asserts
    // against below.
    const version1 = await prisma.postVersion.findFirstOrThrow({
      where: { postId: id, versionNumber: 1 },
    });
    await prisma.post.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedVersionId: version1.id,
        decidedAt: new Date(),
      },
    });
    await prisma.approvalAssignment.updateMany({
      where: { postId: id, status: { in: ["PENDING", "IN_PROGRESS"] } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    const approveAction = await prisma.approvalAction.create({
      data: {
        postId: id,
        postVersionId: version1.id,
        actorId: approver.id,
        action: "APPROVE",
        previousStatus: "IN_REVIEW",
        newStatus: "APPROVED",
      },
    });

    const beforeEdit = await getPostDetail(id, creator.id);
    expect(beforeEdit?.status).toBe("APPROVED");
    expect(beforeEdit?.approvedVersionNumber).toBe(1);
    expect(beforeEdit?.capabilities.canEdit).toBe(true);

    // The edit itself — this is the mechanism Phase 10 adds. lockVersion
    // is 2 here: 1 from the updateDraft above, 1 from submitPost's own
    // increment; the simulated APPROVE update never touches it.
    await updateDraft({
      postId: id,
      creatorId: creator.id,
      input: { lockVersion: 2, contentJson: doc("A necessary fix.") },
    });

    const postRow = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(postRow.status).toBe("DRAFT");
    expect(postRow.approvedVersionId).toBeNull();

    const reopenAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: "Post",
        entityId: id,
        action: "POST_REOPENED_FOR_EDIT",
      },
    });
    expect(reopenAudit).not.toBeNull();

    // The historical decision itself is untouched.
    const preservedAction = await prisma.approvalAction.findUniqueOrThrow({
      where: { id: approveAction.id },
    });
    expect(preservedAction.postVersionId).toBe(version1.id);
    expect(preservedAction.action).toBe("APPROVE");

    // Resubmitting freezes a new, gapless version — the ordinary
    // DRAFT → SUBMITTED path, no second mechanism.
    const resubmitLockVersion = (
      await prisma.post.findUniqueOrThrow({
        where: { id },
        select: { lockVersion: true },
      })
    ).lockVersion;
    const second = await submitPost({
      postId: id,
      input: { lockVersion: resubmitLockVersion },
    });
    expect(second.versionNumber).toBe(2);

    const version2 = await prisma.postVersion.findUniqueOrThrow({
      where: { postId_versionNumber: { postId: id, versionNumber: 2 } },
    });
    expect(version2.supersedesVersionId).toBe(version1.id);
  });
});
