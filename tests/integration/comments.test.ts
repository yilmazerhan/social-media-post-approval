import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDraft, updateDraft, submitPost } from "@/modules/posts";
import type { TiptapDocument } from "@/modules/posts";
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  listMentionableUsers,
} from "@/modules/comments";
import { loadAuthorizedUser, ForbiddenError } from "@/modules/authorization";
import { WorkflowError } from "@/server/http/handler";

/**
 * Phase 15 — threaded comments, server-side mention parsing/notification,
 * and mentionable-user visibility. Exit criterion (IMPLEMENTATION_PLAN.md):
 * "mentions notify the right people; a claimed mention list from the
 * client is ignored" — this module never accepts a mention list as
 * input at all, so that's true by construction; these tests prove the
 * server-parsed mentions actually reach the right `Notification` rows.
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
  opts: { roleKey?: "EMPLOYEE" | "APPROVER"; departmentId?: string } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `comments-${randomUUID()}@editortest.local`,
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
    data: { key: `comments-dept-${randomUUID()}`, name: "Comments Dept" },
  });
  createdDepartmentIds.push(department.id);
  const rule = await prisma.approvalRule.create({
    data: {
      name: `comments-rule-${randomUUID()}`,
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
    input: { title: "Comments post" },
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
  return { postId: id, departmentId: department.id };
}

describe("createComment / listComments", () => {
  it("notifies a mentioned user via a COMMENT_MENTION notification, and lists threaded replies", async () => {
    const approver = await createUser("Comments Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Comments Creator");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    const created = await createComment({
      postId,
      authorId: creator.id,
      authorName: creator.displayName,
      input: { body: `Hey @${approver.displayName}, please take a look.` },
    });
    expect(created.bodyHtml).toContain(
      `<strong class="mention">@${approver.displayName}</strong>`,
    );

    const notification = await prisma.notification.findFirst({
      where: {
        recipientId: approver.id,
        type: "COMMENT_MENTION",
        entityId: created.id,
      },
    });
    expect(notification).not.toBeNull();

    const reply = await createComment({
      postId,
      authorId: approver.id,
      authorName: approver.displayName,
      input: { body: "On it.", parentId: created.id },
    });

    const list = await listComments(postId, creator.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);
    expect(list[0].replies).toHaveLength(1);
    expect(list[0].replies[0].id).toBe(reply.id);
  });

  it("refuses a reply to a reply (one level deep only)", async () => {
    const approver = await createUser("Comments Nested Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Comments Nested Creator");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    const top = await createComment({
      postId,
      authorId: creator.id,
      authorName: creator.displayName,
      input: { body: "Top level." },
    });
    const reply = await createComment({
      postId,
      authorId: approver.id,
      authorName: approver.displayName,
      input: { body: "A reply.", parentId: top.id },
    });

    await expect(
      createComment({
        postId,
        authorId: creator.id,
        authorName: creator.displayName,
        input: { body: "A reply to a reply.", parentId: reply.id },
      }),
    ).rejects.toThrow(WorkflowError);
  });

  it("does not notify a mention the author isn't allowed to see (different department, no POST_READ_ALL)", async () => {
    const outsiderDept = await prisma.department.create({
      data: { key: `outsider-dept-${randomUUID()}`, name: "Outsider Dept" },
    });
    createdDepartmentIds.push(outsiderDept.id);
    const outsider = await createUser("Comments Outsider", {
      departmentId: outsiderDept.id,
    });

    const approver = await createUser("Comments Visibility Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Comments Visibility Creator");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    const created = await createComment({
      postId,
      authorId: creator.id,
      authorName: creator.displayName,
      input: { body: `Ping @${outsider.displayName} anyway.` },
    });

    // The outsider isn't in the creator's mentionable candidate pool
    // (different department, creator holds no POST_READ_ALL), so the
    // literal "@Name" text is never recognized as a real mention.
    expect(created.bodyHtml).not.toContain("mention");
    const notification = await prisma.notification.findFirst({
      where: { recipientId: outsider.id, type: "COMMENT_MENTION" },
    });
    expect(notification).toBeNull();
  });

  it("refuses to list or create comments for a user with no visibility into the post", async () => {
    const outsiderDept = await prisma.department.create({
      data: {
        key: `no-access-dept-${randomUUID()}`,
        name: "No Access Dept",
      },
    });
    createdDepartmentIds.push(outsiderDept.id);
    const outsider = await createUser("Comments No Access", {
      departmentId: outsiderDept.id,
    });
    const approver = await createUser("Comments No Access Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Comments No Access Creator");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    await expect(listComments(postId, outsider.id)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      createComment({
        postId,
        authorId: outsider.id,
        authorName: outsider.displayName,
        input: { body: "I shouldn't be able to post this." },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets an approver (not the creator) see and comment on the post", async () => {
    const approver = await createUser("Comments Approver Access", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Comments Approver Access Creator");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    const comment = await createComment({
      postId,
      authorId: approver.id,
      authorName: approver.displayName,
      input: { body: "Looks fine to me." },
    });
    const list = await listComments(postId, approver.id);
    expect(list.map((c) => c.id)).toContain(comment.id);
  });
});

describe("updateComment / deleteComment", () => {
  it("lets the author edit within the window, and only the author", async () => {
    const approver = await createUser("Comments Edit Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Comments Edit Creator");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    const comment = await createComment({
      postId,
      authorId: creator.id,
      authorName: creator.displayName,
      input: { body: "Original text." },
    });

    const updated = await updateComment({
      postId,
      commentId: comment.id,
      userId: creator.id,
      input: { body: "Edited text." },
    });
    expect(updated.body).toBe("Edited text.");

    await expect(
      updateComment({
        postId,
        commentId: comment.id,
        userId: approver.id,
        input: { body: "Approver tries to edit." },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets the author or a POST_READ_ALL holder delete (soft delete)", async () => {
    const approver = await createUser("Comments Delete Approver", {
      roleKey: "APPROVER",
    });
    const creator = await createUser("Comments Delete Creator");
    // A plain EMPLOYEE holds neither authorship nor POST_READ_ALL —
    // APPROVER (used elsewhere in this file as "not the author") actually
    // does hold POST_READ_ALL (bootstrap-system-data.ts's own
    // APPROVER_PERMISSIONS list), so it's the wrong role to prove this
    // negative with.
    const bystander = await createUser("Comments Delete Bystander");
    const { postId } = await submittedPostForApprover(approver.id, creator.id);

    const comment = await createComment({
      postId,
      authorId: creator.id,
      authorName: creator.displayName,
      input: { body: "Delete me." },
    });

    await expect(
      deleteComment({ postId, commentId: comment.id, userId: bystander.id }),
    ).rejects.toThrow(ForbiddenError);

    // An APPROVER's POST_READ_ALL is exactly the "or admin" reach the
    // permission catalogue actually grants approvers — so the approver
    // (never the author here) can delete too.
    const secondComment = await createComment({
      postId,
      authorId: creator.id,
      authorName: creator.displayName,
      input: { body: "Delete me too." },
    });
    await deleteComment({
      postId,
      commentId: secondComment.id,
      userId: approver.id,
    });

    await deleteComment({
      postId,
      commentId: comment.id,
      userId: creator.id,
    });
    const list = await listComments(postId, creator.id);
    expect(list.map((c) => c.id)).not.toContain(comment.id);
    expect(list.map((c) => c.id)).not.toContain(secondComment.id);
  });
});

describe("listMentionableUsers", () => {
  it("scopes to the caller's department, widened for a POST_READ_ALL holder", async () => {
    const department = await prisma.department.create({
      data: {
        key: `mentionable-dept-${randomUUID()}`,
        name: "Mentionable Dept",
      },
    });
    createdDepartmentIds.push(department.id);
    const colleague = await createUser("Mentionable Colleague", {
      departmentId: department.id,
    });
    const caller = await createUser("Mentionable Caller", {
      departmentId: department.id,
    });
    const outsider = await createUser("Mentionable Outsider");

    const authz = await loadAuthorizedUser(caller.id);
    const results = await listMentionableUsers(authz, "Mentionable");
    const ids = results.map((r) => r.id);
    expect(ids).toContain(colleague.id);
    expect(ids).not.toContain(outsider.id);

    const admin = await createUser("Mentionable Admin", {
      roleKey: "APPROVER",
    });
    await prisma.role
      .findUniqueOrThrow({ where: { key: "ADMIN" } })
      .then(async (adminRole) => {
        await prisma.userRole.create({
          data: { userId: admin.id, roleId: adminRole.id },
        });
      });
    const adminAuthz = await loadAuthorizedUser(admin.id);
    const adminResults = await listMentionableUsers(adminAuthz, "Mentionable");
    expect(adminResults.map((r) => r.id)).toContain(outsider.id);
  });
});
