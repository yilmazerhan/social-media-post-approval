import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { runRetentionForTarget } from "@/modules/retention";

/**
 * Phase 20 — retention. Exit criterion (IMPLEMENTATION_PLAN.md): a dry
 * run reports candidates and deletes nothing; a real run acts on exactly
 * those candidates; an attachment referenced by any version is never
 * removed.
 *
 * Each test temporarily narrows the one shared seeded policy row for its
 * target (RetentionPolicy.target is UNIQUE — there's only ever one row
 * per target) and restores it in `finally`. No other test in this suite
 * reads RetentionPolicy/RetentionRun, so this narrow, restored window is
 * safe under vitest's cross-file parallelism.
 */

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function createUser(displayName: string) {
  const user = await prisma.user.create({
    data: {
      email: `retention-${randomUUID()}@editortest.local`,
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

async function withNarrowedPolicy<T>(
  target: "AUDIT_LOG" | "POST" | "ATTACHMENT",
  overrides: { retentionDays?: number; isEnabled?: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  const original = await prisma.retentionPolicy.findUniqueOrThrow({
    where: { target },
  });
  await prisma.retentionPolicy.update({
    where: { target },
    data: overrides,
  });
  try {
    return await fn();
  } finally {
    await prisma.retentionPolicy.update({
      where: { target },
      data: {
        retentionDays: original.retentionDays,
        isEnabled: original.isEnabled,
      },
    });
  }
}

describe("AUDIT_LOG retention", () => {
  it("a dry run reports candidates and deletes nothing; a real run deletes exactly those", async () => {
    const user = await createUser("Retention Audit User");
    const old = await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "TEST_OLD_EVENT",
        entityType: "Test",
        entityId: randomUUID(),
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });
    const recent = await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "TEST_RECENT_EVENT",
        entityType: "Test",
        entityId: randomUUID(),
      },
    });

    await withNarrowedPolicy("AUDIT_LOG", { retentionDays: 5 }, async () => {
      const dryRunResult = await runRetentionForTarget("AUDIT_LOG", true);
      expect(dryRunResult?.dryRun).toBe(true);
      expect(dryRunResult?.candidateCount).toBeGreaterThanOrEqual(1);
      expect(dryRunResult?.deletedCount).toBe(0);
      const stillThere = await prisma.auditLog.findUnique({
        where: { id: old.id },
      });
      expect(stillThere).not.toBeNull();

      const realRunResult = await runRetentionForTarget("AUDIT_LOG", false);
      expect(realRunResult?.dryRun).toBe(false);
      expect(realRunResult?.deletedCount).toBe(realRunResult?.candidateCount);

      const deleted = await prisma.auditLog.findUnique({
        where: { id: old.id },
      });
      expect(deleted).toBeNull();
      const kept = await prisma.auditLog.findUnique({
        where: { id: recent.id },
      });
      expect(kept).not.toBeNull();
    });

    await prisma.auditLog.deleteMany({ where: { id: recent.id } });
  });
});

describe("POST retention", () => {
  it("archives an old decided post (status + archivedAt + audit entry) rather than deleting it, and skips a recent one", async () => {
    const creator = await createUser("Retention Post Creator");
    const oldPost = await prisma.post.create({
      data: {
        reference: `RET-${randomUUID().slice(0, 8)}`,
        title: "Old approved post",
        creatorId: creator.id,
        status: "APPROVED",
        decidedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      },
    });
    const recentPost = await prisma.post.create({
      data: {
        reference: `RET-${randomUUID().slice(0, 8)}`,
        title: "Recently approved post",
        creatorId: creator.id,
        status: "APPROVED",
        decidedAt: new Date(),
      },
    });

    try {
      await withNarrowedPolicy("POST", { retentionDays: 30 }, async () => {
        const dryRunResult = await runRetentionForTarget("POST", true);
        expect(dryRunResult?.candidateCount).toBeGreaterThanOrEqual(1);
        expect(dryRunResult?.deletedCount).toBe(0);
        const stillApproved = await prisma.post.findUniqueOrThrow({
          where: { id: oldPost.id },
        });
        expect(stillApproved.status).toBe("APPROVED");

        await runRetentionForTarget("POST", false);

        const archived = await prisma.post.findUniqueOrThrow({
          where: { id: oldPost.id },
        });
        expect(archived.status).toBe("ARCHIVED");
        expect(archived.archivedAt).not.toBeNull();

        const stillFresh = await prisma.post.findUniqueOrThrow({
          where: { id: recentPost.id },
        });
        expect(stillFresh.status).toBe("APPROVED");

        const auditEntry = await prisma.auditLog.findFirst({
          where: { action: "POST_ARCHIVED", entityId: oldPost.id },
        });
        expect(auditEntry).not.toBeNull();
      });
    } finally {
      await prisma.post.deleteMany({
        where: { id: { in: [oldPost.id, recentPost.id] } },
      });
    }
  });
});

describe("POST retention — stage 2", () => {
  it("hard-deletes an already-archived post past the same retentionDays window, cascading its version, while its audit trail (written first) survives with a now-dangling postId", async () => {
    const creator = await createUser("Retention Post Stage2 Creator");
    const archivedPost = await prisma.post.create({
      data: {
        reference: `RET-${randomUUID().slice(0, 8)}`,
        title: "Long-archived post",
        creatorId: creator.id,
        status: "ARCHIVED",
        decidedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        archivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      },
    });
    const version = await prisma.postVersion.create({
      data: {
        postId: archivedPost.id,
        versionNumber: 1,
        title: archivedPost.title,
        contentJson: {},
        contentHtml: "<p></p>",
        contentText: "",
        characterCount: 0,
        wordCount: 0,
        createdById: creator.id,
      },
    });
    const recentlyArchivedPost = await prisma.post.create({
      data: {
        reference: `RET-${randomUUID().slice(0, 8)}`,
        title: "Recently archived post",
        creatorId: creator.id,
        status: "ARCHIVED",
        decidedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        archivedAt: new Date(),
      },
    });

    try {
      await withNarrowedPolicy("POST", { retentionDays: 30 }, async () => {
        const dryRunResult = await runRetentionForTarget("POST", true);
        expect(dryRunResult?.deletedCount).toBe(0);
        const stillArchived = await prisma.post.findUniqueOrThrow({
          where: { id: archivedPost.id },
        });
        expect(stillArchived.status).toBe("ARCHIVED");

        await runRetentionForTarget("POST", false);

        const deletedPost = await prisma.post.findUnique({
          where: { id: archivedPost.id },
        });
        expect(deletedPost).toBeNull();
        const deletedVersion = await prisma.postVersion.findUnique({
          where: { id: version.id },
        });
        expect(deletedVersion).toBeNull();

        const stillThere = await prisma.post.findUniqueOrThrow({
          where: { id: recentlyArchivedPost.id },
        });
        expect(stillThere.status).toBe("ARCHIVED");

        const auditEntry = await prisma.auditLog.findFirst({
          where: { action: "POST_DELETED", entityId: archivedPost.id },
        });
        expect(auditEntry).not.toBeNull();
        expect(auditEntry?.postId).toBe(archivedPost.id);
      });
    } finally {
      await prisma.post.deleteMany({
        where: { id: recentlyArchivedPost.id },
      });
      await prisma.auditLog.deleteMany({
        where: { entityId: archivedPost.id },
      });
    }
  });
});

describe("ATTACHMENT retention", () => {
  it("never reports or removes anything — attachment cleanup stays Phase 9's job alone", async () => {
    const dryRunResult = await runRetentionForTarget("ATTACHMENT", true);
    expect(dryRunResult?.candidateCount).toBe(0);
    const realRunResult = await runRetentionForTarget("ATTACHMENT", false);
    expect(realRunResult?.deletedCount).toBe(0);
  });
});
