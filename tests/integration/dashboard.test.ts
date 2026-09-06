import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import type { AuthorizedUser } from "@/modules/authorization";
import { getEmployeeDashboard, getContentVolumeSeries } from "@/modules/posts";
import {
  getApproverDashboard,
  getSystemApprovalStats,
} from "@/modules/approvals";
import { getUserStats } from "@/modules/users";
import { getSystemHealth } from "@/server/health";

/**
 * Phase 7's exit criterion is "counts match the database" — these tests
 * create real fixture rows and check the dashboard module functions
 * against them directly. Two shapes of assertion are used depending on
 * whether a query is scoped to a fixture-owned id:
 *
 * - Scoped queries (a specific creator's posts, a specific approver's
 *   assignments) are asserted exactly — nothing else in the database can
 *   affect them.
 * - System-wide queries (getSystemApprovalStats, getUserStats,
 *   getContentVolumeSeries) are asserted as a *delta* across a known set
 *   of new rows, since tests/integration/seed-idempotency.test.ts seeds
 *   real Post/User/ApprovalAssignment rows into this same test database
 *   and file execution order isn't guaranteed.
 */

const createdUserIds: string[] = [];
const createdPostIds: string[] = [];
const createdGroupIds: string[] = [];
const createdJobIds: bigint[] = [];
const createdEmailLogIds: bigint[] = [];

afterAll(async () => {
  if (createdPostIds.length) {
    // Post's onDelete: Cascade relations take versions, assignments,
    // actions, comments and notifications with it.
    await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  }
  if (createdJobIds.length) {
    await prisma.backgroundJob.deleteMany({
      where: { id: { in: createdJobIds } },
    });
  }
  if (createdEmailLogIds.length) {
    await prisma.emailLog.deleteMany({
      where: { id: { in: createdEmailLogIds } },
    });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (createdGroupIds.length) {
    await prisma.group.deleteMany({ where: { id: { in: createdGroupIds } } });
  }
  await prisma.$disconnect();
});

async function createUser(
  displayName: string,
  status: "ACTIVE" | "DISABLED" = "ACTIVE",
) {
  const user = await prisma.user.create({
    data: {
      email: `dash-${randomUUID()}@dashtest.local`,
      displayName,
      firstName: displayName,
      lastName: "Test",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
      status,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createPost(params: {
  creatorId: string;
  status: Parameters<typeof prisma.post.create>[0]["data"]["status"];
  title?: string;
}) {
  const post = await prisma.post.create({
    data: {
      reference: `DASH-TEST-${randomUUID()}`,
      title: params.title ?? "Dashboard fixture post",
      creatorId: params.creatorId,
      status: params.status,
    },
  });
  createdPostIds.push(post.id);
  const version = await prisma.postVersion.create({
    data: {
      postId: post.id,
      versionNumber: 1,
      title: post.title,
      contentJson: { type: "doc", content: [] },
      contentHtml: "<p>Fixture</p>",
      contentText: "Fixture",
      characterCount: 7,
      wordCount: 1,
      createdById: params.creatorId,
    },
  });
  return { post, version };
}

describe("getEmployeeDashboard", () => {
  it("counts a user's own posts by status and surfaces recent activity", async () => {
    const creator = await createUser("Dash Employee");
    const reviewer = await createUser("Dash Reviewer");

    await createPost({ creatorId: creator.id, status: "DRAFT" });
    const { post: inReviewPost, version } = await createPost({
      creatorId: creator.id,
      status: "IN_REVIEW",
      title: "In review fixture",
    });
    await createPost({ creatorId: creator.id, status: "SUBMITTED" });
    await createPost({ creatorId: creator.id, status: "CHANGES_REQUESTED" });
    await createPost({ creatorId: creator.id, status: "APPROVED" });
    await createPost({ creatorId: creator.id, status: "REJECTED" });

    await prisma.approvalAction.create({
      data: {
        postId: inReviewPost.id,
        postVersionId: version.id,
        actorId: creator.id,
        action: "SUBMIT",
        previousStatus: "DRAFT",
        newStatus: "SUBMITTED",
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.approvalAction.create({
      data: {
        postId: inReviewPost.id,
        postVersionId: version.id,
        actorId: reviewer.id,
        action: "START_REVIEW",
        previousStatus: "SUBMITTED",
        newStatus: "IN_REVIEW",
        createdAt: new Date(),
      },
    });

    const dashboard = await getEmployeeDashboard(creator.id);

    expect(dashboard.hasAnyPosts).toBe(true);
    expect(dashboard.counts).toEqual({
      drafts: 1,
      pendingApproval: 2, // SUBMITTED + IN_REVIEW
      changesRequested: 1,
      approved: 1,
      rejected: 1,
    });
    expect(dashboard.recentActivity).toHaveLength(2);
    expect(dashboard.recentActivity[0]).toMatchObject({
      action: "START_REVIEW",
      actorName: "Dash Reviewer",
      postTitle: "In review fixture",
    });
    expect(dashboard.recentActivity[1]).toMatchObject({
      action: "SUBMIT",
      actorName: "Dash Employee",
    });
  });

  it("reports the empty state for a brand-new user with no posts", async () => {
    const freshUser = await createUser("Dash Fresh");
    const dashboard = await getEmployeeDashboard(freshUser.id);

    expect(dashboard.hasAnyPosts).toBe(false);
    expect(dashboard.counts).toEqual({
      drafts: 0,
      pendingApproval: 0,
      changesRequested: 0,
      approved: 0,
      rejected: 0,
    });
    expect(dashboard.recentActivity).toEqual([]);
  });
});

describe("getContentVolumeSeries", () => {
  it("buckets submitted versions by day as a delta over the window", async () => {
    const creator = await createUser("Dash Volume Creator");
    const before = await getContentVolumeSeries(14);

    const daysAgo = (n: number) =>
      new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    const targetOffsets = [6, 9, 13];
    for (const offset of targetOffsets) {
      const { version } = await createPost({
        creatorId: creator.id,
        status: "IN_REVIEW",
      });
      await prisma.postVersion.update({
        where: { id: version.id },
        data: { submittedAt: daysAgo(offset) },
      });
    }

    const after = await getContentVolumeSeries(14);
    expect(after).toHaveLength(14);

    const beforeByDate = new Map(before.map((p) => [p.date, p.count]));
    for (const offset of targetOffsets) {
      const key = daysAgo(offset).toISOString().slice(0, 10);
      const afterPoint = after.find((p) => p.date === key);
      expect(afterPoint?.count).toBe((beforeByDate.get(key) ?? 0) + 1);
    }
  });
});

describe("getApproverDashboard", () => {
  it("scopes counts and SLA compliance to assignments routed to the user or their group", async () => {
    const approver = await createUser("Dash Approver");
    const otherApprover = await createUser("Dash Other Approver");
    const group = await prisma.group.create({
      data: { key: `dash-group-${randomUUID()}`, name: "Dash Group" },
    });
    createdGroupIds.push(group.id);
    await prisma.userGroup.create({
      data: { userId: approver.id, groupId: group.id },
    });

    const now = Date.now();
    const hoursFromNow = (h: number) => new Date(now + h * 60 * 60 * 1000);
    const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);

    async function assignment(params: {
      status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
      assigneeUserId?: string;
      assigneeGroupId?: string;
      dueAt?: Date | null;
      warningAt?: Date | null;
      completedAt?: Date | null;
    }) {
      const { post, version } = await createPost({
        creatorId: approver.id,
        status: "IN_REVIEW",
      });
      return prisma.approvalAssignment.create({
        data: {
          postId: post.id,
          postVersionId: version.id,
          assigneeUserId: params.assigneeUserId,
          assigneeGroupId: params.assigneeGroupId,
          status: params.status,
          dueAt: params.dueAt,
          warningAt: params.warningAt,
          completedAt: params.completedAt,
        },
      });
    }

    // a) due soon: warning has passed, not yet due.
    await assignment({
      status: "IN_PROGRESS",
      assigneeUserId: approver.id,
      dueAt: hoursFromNow(6),
      warningAt: hoursFromNow(-1),
    });
    // b) overdue: due date already passed.
    await assignment({
      status: "PENDING",
      assigneeUserId: approver.id,
      dueAt: hoursFromNow(-2),
      warningAt: hoursFromNow(-5),
    });
    // c) completed on time.
    await assignment({
      status: "COMPLETED",
      assigneeUserId: approver.id,
      dueAt: daysAgo(1),
      completedAt: daysAgo(2),
    });
    // d) completed late.
    await assignment({
      status: "COMPLETED",
      assigneeUserId: approver.id,
      dueAt: daysAgo(4),
      completedAt: daysAgo(3),
    });
    // e) routed through the group, no due date computed yet.
    await assignment({ status: "PENDING", assigneeGroupId: group.id });
    // decoy: not assigned to this approver or their group.
    await assignment({ status: "PENDING", assigneeUserId: otherApprover.id });

    const authzUser: AuthorizedUser = {
      id: approver.id,
      departmentId: null,
      permissions: new Set(),
      groupIds: new Set([group.id]),
    };

    const dashboard = await getApproverDashboard(authzUser);

    expect(dashboard.counts).toEqual({
      pending: 3, // a, b, e
      dueSoon: 1, // a
      overdue: 1, // b
      recentlyCompleted: 2, // c, d
    });
    expect(dashboard.slaCompliance).toEqual({
      decided: 2,
      onTime: 1,
      compliancePercent: 50,
    });
  });
});

describe("getSystemApprovalStats and getUserStats", () => {
  it("reflect new pending/overdue assignments as a delta", async () => {
    const creator = await createUser("Dash System Creator");
    const before = await getSystemApprovalStats();

    const now = Date.now();
    const { post: openPost, version: openVersion } = await createPost({
      creatorId: creator.id,
      status: "IN_REVIEW",
    });
    await prisma.approvalAssignment.create({
      data: {
        postId: openPost.id,
        postVersionId: openVersion.id,
        assigneeUserId: creator.id,
        status: "PENDING",
        dueAt: new Date(now + 6 * 60 * 60 * 1000),
      },
    });
    const { post: overduePost, version: overdueVersion } = await createPost({
      creatorId: creator.id,
      status: "IN_REVIEW",
    });
    await prisma.approvalAssignment.create({
      data: {
        postId: overduePost.id,
        postVersionId: overdueVersion.id,
        assigneeUserId: creator.id,
        status: "PENDING",
        dueAt: new Date(now - 6 * 60 * 60 * 1000),
      },
    });
    const { post: donePost, version: doneVersion } = await createPost({
      creatorId: creator.id,
      status: "APPROVED",
    });
    const assignedAt = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const completedAt = new Date(assignedAt.getTime() + 45 * 60_000);
    await prisma.approvalAssignment.create({
      data: {
        postId: donePost.id,
        postVersionId: doneVersion.id,
        assigneeUserId: creator.id,
        status: "COMPLETED",
        assignedAt,
        completedAt,
      },
    });

    const after = await getSystemApprovalStats();

    expect(after.pending).toBe(before.pending + 2);
    expect(after.overdue).toBe(before.overdue + 1);

    // Shadow-computed independently, so this checks the implementation's
    // window/status/field choices rather than restating them.
    const since = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const completedRows = await prisma.approvalAssignment.findMany({
      where: { status: "COMPLETED", completedAt: { gte: since, not: null } },
      select: { assignedAt: true, completedAt: true },
    });
    const durationsMinutes = completedRows
      .filter(
        (row): row is { assignedAt: Date; completedAt: Date } =>
          row.completedAt !== null,
      )
      .map(
        (row) =>
          (row.completedAt.getTime() - row.assignedAt.getTime()) / 60_000,
      );
    const expectedAvg =
      durationsMinutes.reduce((sum, m) => sum + m, 0) / durationsMinutes.length;
    expect(after.avgApprovalMinutes).toBe(Math.round(expectedAvg));
  });

  it("reflects new users as a delta", async () => {
    const before = await getUserStats();
    await createUser("Dash Stats Active 1", "ACTIVE");
    await createUser("Dash Stats Active 2", "ACTIVE");
    await createUser("Dash Stats Disabled", "DISABLED");

    const after = await getUserStats();
    expect(after.total).toBe(before.total + 3);
    expect(after.active).toBe(before.active + 2);
  });
});

describe("getSystemHealth", () => {
  it("reports the database tile healthy and the storage tile writable with a usage figure", async () => {
    await mkdir(config.STORAGE_PATH, { recursive: true });
    const tiles = await getSystemHealth();
    const database = tiles.find((t) => t.key === "database");
    const storage = tiles.find((t) => t.key === "storage");
    expect(database?.status).toBe("healthy");
    // "degraded" is a real, disk-usage-dependent status now (not just
    // writability) — never "down", since the directory does exist and is
    // writable here.
    expect(storage?.status).not.toBe("down");
    expect(storage?.detail).toMatch(/used of/);
  });

  it("reports the backup tile as degraded before any backup has run, and healthy once the marker is set", async () => {
    const before = await getSystemHealth();
    expect(before.find((t) => t.key === "backup")?.status).toBe("degraded");

    await prisma.systemSetting.update({
      where: { key: "system.backup.lastRunAt" },
      data: { value: new Date().toISOString() },
    });
    try {
      const after = await getSystemHealth();
      expect(after.find((t) => t.key === "backup")?.status).toBe("healthy");
    } finally {
      await prisma.systemSetting.update({
        where: { key: "system.backup.lastRunAt" },
        data: { value: null },
      });
    }
  });

  it("reports the worker tile as down when no heartbeat has ever been recorded", async () => {
    const original = await prisma.systemSetting.findUnique({
      where: { key: "system.worker.lastHeartbeatAt" },
    });
    await prisma.systemSetting.update({
      where: { key: "system.worker.lastHeartbeatAt" },
      data: { value: null },
    });
    try {
      const tiles = await getSystemHealth();
      const worker = tiles.find((t) => t.key === "worker");
      expect(worker?.status).toBe("down");
      expect(worker?.detail).toMatch(/no worker heartbeat/i);
    } finally {
      await prisma.systemSetting.update({
        where: { key: "system.worker.lastHeartbeatAt" },
        data: { value: original?.value ?? null },
      });
    }
  });

  it("reports the worker tile as down when the last heartbeat is stale", async () => {
    await prisma.systemSetting.update({
      where: { key: "system.worker.lastHeartbeatAt" },
      data: { value: new Date(Date.now() - 10 * 60 * 1000).toISOString() },
    });
    const tiles = await getSystemHealth();
    const worker = tiles.find((t) => t.key === "worker");
    expect(worker?.status).toBe("down");
    expect(worker?.detail).toMatch(/last heartbeat/i);
  });

  it("reports the worker tile as degraded after a permanently failed job, given a fresh heartbeat", async () => {
    await prisma.systemSetting.update({
      where: { key: "system.worker.lastHeartbeatAt" },
      data: { value: new Date().toISOString() },
    });
    const job = await prisma.backgroundJob.create({
      data: {
        type: "EMAIL_SEND",
        payload: {},
        status: "DEAD",
        lastError: "fixture failure",
      },
    });
    createdJobIds.push(job.id);

    const tiles = await getSystemHealth();
    const worker = tiles.find((t) => t.key === "worker");
    expect(worker?.status).toBe("degraded");
    expect(worker?.detail).toMatch(/failed permanently/);
  });

  it("reports the email tile as degraded after a failed delivery", async () => {
    const log = await prisma.emailLog.create({
      data: {
        templateKey: "fixture",
        toAddress: "nobody@dashtest.local",
        subject: "Fixture",
        status: "FAILED",
        lastError: "fixture failure",
      },
    });
    createdEmailLogIds.push(log.id);

    const tiles = await getSystemHealth();
    const email = tiles.find((t) => t.key === "email");
    expect(email?.status).toBe("degraded");
    expect(email?.detail).toMatch(/failed to send/);
  });
});
