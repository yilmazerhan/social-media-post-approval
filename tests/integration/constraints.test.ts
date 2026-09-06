import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";

/**
 * Proves the invariants DATABASE.md documents at the database level —
 * not just in application code — by exercising them against the real
 * PostgreSQL test database (content_approval_test). Cleans up everything
 * it creates.
 */

const createdUserIds: string[] = [];
const createdPostIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdSlaPolicyIds: string[] = [];

afterAll(async () => {
  if (createdSlaPolicyIds.length) {
    await prisma.slaPolicy.deleteMany({
      where: { id: { in: createdSlaPolicyIds } },
    });
  }
  if (createdPostIds.length) {
    await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
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

async function makeUser(
  overrides: Partial<Parameters<typeof prisma.user.create>[0]["data"]> = {},
) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `test-${suffix}@example.local`,
      displayName: "Test User",
      firstName: "Test",
      lastName: "User",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makePostWithVersion(creatorId: string) {
  const suffix = randomUUID();
  const post = await prisma.post.create({
    data: { reference: `TEST-${suffix}`, title: "Test post", creatorId },
  });
  createdPostIds.push(post.id);
  const version = await prisma.postVersion.create({
    data: {
      postId: post.id,
      versionNumber: 1,
      title: "Test post",
      contentJson: { type: "doc", content: [] },
      contentHtml: "<p></p>",
      contentText: "",
      characterCount: 0,
      wordCount: 0,
      createdById: creatorId,
    },
  });
  return { post, version };
}

describe("User constraints", () => {
  it("rejects a duplicate email (case-insensitively, via citext)", async () => {
    const suffix = randomUUID();
    const email = `Dup-${suffix}@Example.local`;
    await makeUser({ email });

    await expect(makeUser({ email: email.toLowerCase() })).rejects.toThrow();
  });

  it("rejects an ENTRA_ID user with a password hash set", async () => {
    await expect(
      makeUser({
        authProvider: "ENTRA_ID",
        externalIdentityId: randomUUID(),
        passwordHash: "should-not-be-allowed",
      }),
    ).rejects.toThrow();
  });

  it("rejects a LOCAL user with no password unless status is PENDING", async () => {
    await expect(
      makeUser({ passwordHash: null, status: "ACTIVE" }),
    ).rejects.toThrow();
  });

  it("allows a LOCAL user with no password when status is PENDING", async () => {
    const user = await makeUser({ passwordHash: null, status: "PENDING" });
    expect(user.status).toBe("PENDING");
  });

  it("allows an ENTRA_ID user with no password", async () => {
    const user = await makeUser({
      authProvider: "ENTRA_ID",
      externalIdentityId: randomUUID(),
      passwordHash: null,
    });
    expect(user.authProvider).toBe("ENTRA_ID");
  });
});

describe("ApprovalAssignment constraints", () => {
  it("rejects an assignment with neither an assignee user nor group", async () => {
    const creator = await makeUser();
    const { post, version } = await makePostWithVersion(creator.id);

    await expect(
      prisma.approvalAssignment.create({
        data: { postId: post.id, postVersionId: version.id, status: "PENDING" },
      }),
    ).rejects.toThrow();
  });

  it("rejects an assignment with both an assignee user and group", async () => {
    const creator = await makeUser();
    const approver = await makeUser();
    const { post, version } = await makePostWithVersion(creator.id);
    const group = await prisma.group.create({
      data: { key: `g-${randomUUID()}`, name: "Test group" },
    });

    await expect(
      prisma.approvalAssignment.create({
        data: {
          postId: post.id,
          postVersionId: version.id,
          assigneeUserId: approver.id,
          assigneeGroupId: group.id,
          status: "PENDING",
        },
      }),
    ).rejects.toThrow();

    await prisma.group.delete({ where: { id: group.id } });
  });

  it("allows only one open (pending/in-progress) assignment per post", async () => {
    const creator = await makeUser();
    const approver = await makeUser();
    const { post, version } = await makePostWithVersion(creator.id);

    await prisma.approvalAssignment.create({
      data: {
        postId: post.id,
        postVersionId: version.id,
        assigneeUserId: approver.id,
        status: "PENDING",
      },
    });

    await expect(
      prisma.approvalAssignment.create({
        data: {
          postId: post.id,
          postVersionId: version.id,
          assigneeUserId: approver.id,
          status: "IN_PROGRESS",
        },
      }),
    ).rejects.toThrow();

    // A second COMPLETED assignment is fine — the index only restricts open ones.
    const completed = await prisma.approvalAssignment.create({
      data: {
        postId: post.id,
        postVersionId: version.id,
        assigneeUserId: approver.id,
        status: "COMPLETED",
      },
    });
    expect(completed.status).toBe("COMPLETED");
  });
});

describe("ApprovalAction constraints", () => {
  it("rejects REQUEST_CHANGES and REJECT without a comment", async () => {
    const creator = await makeUser();
    const { post, version } = await makePostWithVersion(creator.id);

    await expect(
      prisma.approvalAction.create({
        data: {
          postId: post.id,
          postVersionId: version.id,
          actorId: creator.id,
          action: "REQUEST_CHANGES",
          previousStatus: "IN_REVIEW",
          newStatus: "CHANGES_REQUESTED",
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.approvalAction.create({
        data: {
          postId: post.id,
          postVersionId: version.id,
          actorId: creator.id,
          action: "REJECT",
          comment: "   ",
          previousStatus: "IN_REVIEW",
          newStatus: "REJECTED",
        },
      }),
    ).rejects.toThrow();
  });

  it("allows APPROVE without a comment", async () => {
    const creator = await makeUser();
    const { post, version } = await makePostWithVersion(creator.id);

    const action = await prisma.approvalAction.create({
      data: {
        postId: post.id,
        postVersionId: version.id,
        actorId: creator.id,
        action: "APPROVE",
        previousStatus: "IN_REVIEW",
        newStatus: "APPROVED",
      },
    });
    expect(action.action).toBe("APPROVE");
  });
});

describe("SlaPolicy tiered uniqueness", () => {
  it("allows one department+priority policy but rejects a duplicate", async () => {
    const department = await prisma.department.create({
      data: { key: `dept-${randomUUID()}`, name: "Test dept" },
    });
    createdDepartmentIds.push(department.id);

    const first = await prisma.slaPolicy.create({
      data: {
        name: "First",
        departmentId: department.id,
        priority: "URGENT",
        durationMinutes: 60,
      },
    });
    createdSlaPolicyIds.push(first.id);

    await expect(
      prisma.slaPolicy.create({
        data: {
          name: "Duplicate",
          departmentId: department.id,
          priority: "URGENT",
          durationMinutes: 90,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a second priority-only policy for the same priority", async () => {
    // bootstrap-system-data seeds one priority-only row per priority as
    // real system defaults, and this suite shares a database with tests
    // that exercise that seeding — so a URGENT priority-only row may or
    // may not already exist here. Top up to exactly one first (tracking
    // only what this test itself creates for cleanup), then prove a
    // second one is always rejected regardless of which run seeded the
    // first.
    const existing = await prisma.slaPolicy.findFirst({
      where: { departmentId: null, priority: "URGENT" },
    });
    if (!existing) {
      const first = await prisma.slaPolicy.create({
        data: {
          name: "First priority-only",
          priority: "URGENT",
          durationMinutes: 60,
        },
      });
      createdSlaPolicyIds.push(first.id);
    }

    await expect(
      prisma.slaPolicy.create({
        data: {
          name: "Second priority-only",
          priority: "URGENT",
          durationMinutes: 90,
        },
      }),
    ).rejects.toThrow();
  });
});
