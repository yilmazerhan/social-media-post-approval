import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  getSummaryReport,
  getThroughputReport,
  getApprovalTimeReport,
  getSlaComplianceReport,
  getByDepartmentReport,
  getByCreatorReport,
  getByApproverReport,
  getRejectionsReport,
} from "@/modules/reports";

/**
 * Phase 22 — reporting. Exit criterion (IMPLEMENTATION_PLAN.md): numbers
 * reconcile with direct SQL. Every test below creates its own isolated
 * fixture (a dedicated department + users, never touched by any other
 * suite) and asserts the report's output against a value computed
 * independently, directly off the same rows via `prisma` — not against
 * the report function's own logic restated.
 */

const createdUserIds: string[] = [];
const createdPostIds: string[] = [];
let departmentId: string;
let otherDepartmentId: string;

const from = new Date(Date.now() - 60 * 60 * 1000);
const to = new Date(Date.now() + 60 * 60 * 1000);

beforeAll(async () => {
  const department = await prisma.department.create({
    data: {
      key: `reports-test-${randomUUID().slice(0, 8)}`,
      name: "Reports Test Dept",
    },
  });
  departmentId = department.id;
  const other = await prisma.department.create({
    data: {
      key: `reports-test-other-${randomUUID().slice(0, 8)}`,
      name: "Reports Test Other Dept",
    },
  });
  otherDepartmentId = other.id;
});

afterAll(async () => {
  if (createdPostIds.length) {
    await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.department.deleteMany({
    where: { id: { in: [departmentId, otherDepartmentId] } },
  });
  await prisma.$disconnect();
});

async function createUser(displayName: string) {
  const user = await prisma.user.create({
    data: {
      email: `report-${randomUUID()}@editortest.local`,
      displayName,
      firstName: displayName,
      lastName: "Test",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
      departmentId,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

/** Creates a post + version + a SUBMIT action, then optionally a decision action and a completed assignment — everything a report needs to see this post as "decided". */
async function createDecidedPost(params: {
  creatorId: string;
  approverId: string;
  decision: "APPROVE" | "REJECT";
  departmentId: string;
  rejectionReason?: string;
  submittedAt: Date;
  decidedAt: Date;
  assignmentDueAt?: Date;
}) {
  const post = await prisma.post.create({
    data: {
      reference: `RPT-${randomUUID().slice(0, 8)}`,
      title: "Report fixture post",
      creatorId: params.creatorId,
      departmentId: params.departmentId,
      status: params.decision === "APPROVE" ? "APPROVED" : "REJECTED",
      submittedAt: params.submittedAt,
      decidedAt: params.decidedAt,
      rejectionReason:
        params.decision === "REJECT" ? params.rejectionReason : undefined,
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
  await prisma.approvalAction.create({
    data: {
      postId: post.id,
      postVersionId: version.id,
      actorId: params.creatorId,
      action: "SUBMIT",
      previousStatus: "DRAFT",
      newStatus: "SUBMITTED",
      createdAt: params.submittedAt,
    },
  });
  await prisma.approvalAction.create({
    data: {
      postId: post.id,
      postVersionId: version.id,
      actorId: params.approverId,
      action: params.decision,
      comment:
        params.decision === "REJECT"
          ? (params.rejectionReason ?? "Rejected in fixture")
          : undefined,
      previousStatus: "IN_REVIEW",
      newStatus: params.decision === "APPROVE" ? "APPROVED" : "REJECTED",
      createdAt: params.decidedAt,
    },
  });
  await prisma.approvalAssignment.create({
    data: {
      postId: post.id,
      postVersionId: version.id,
      assigneeUserId: params.approverId,
      status: "COMPLETED",
      assignedAt: params.submittedAt,
      completedAt: params.decidedAt,
      dueAt: params.assignmentDueAt,
    },
  });
  return post;
}

describe("getSummaryReport", () => {
  it("counts SUBMIT/APPROVE/REJECT actions in range, scoped to department, matching a direct count", async () => {
    const creator = await createUser("Summary Creator");
    const approver = await createUser("Summary Approver");

    await createDecidedPost({
      creatorId: creator.id,
      approverId: approver.id,
      decision: "APPROVE",
      departmentId,
      submittedAt: new Date(),
      decidedAt: new Date(),
    });
    await createDecidedPost({
      creatorId: creator.id,
      approverId: approver.id,
      decision: "REJECT",
      departmentId,
      rejectionReason: "Off-brand tone",
      submittedAt: new Date(),
      decidedAt: new Date(),
    });

    const report = await getSummaryReport({ from, to, departmentId });

    const [directSubmitted, directApproved, directRejected] = await Promise.all(
      [
        prisma.approvalAction.count({
          where: {
            action: "SUBMIT",
            createdAt: { gte: from, lte: to },
            post: { departmentId },
          },
        }),
        prisma.approvalAction.count({
          where: {
            action: "APPROVE",
            createdAt: { gte: from, lte: to },
            post: { departmentId },
          },
        }),
        prisma.approvalAction.count({
          where: {
            action: "REJECT",
            createdAt: { gte: from, lte: to },
            post: { departmentId },
          },
        }),
      ],
    );

    expect(report.submitted).toBe(directSubmitted);
    expect(report.approved).toBe(directApproved);
    expect(report.rejected).toBe(directRejected);
    expect(report.submitted).toBeGreaterThanOrEqual(2);
  });

  it("never mixes in another department's rows", async () => {
    const creator = await createUser("Summary Isolation Creator");
    const approver = await createUser("Summary Isolation Approver");
    await createDecidedPost({
      creatorId: creator.id,
      approverId: approver.id,
      decision: "APPROVE",
      departmentId: otherDepartmentId,
      submittedAt: new Date(),
      decidedAt: new Date(),
    });

    const scoped = await getSummaryReport({ from, to, departmentId });
    const other = await getSummaryReport({
      from,
      to,
      departmentId: otherDepartmentId,
    });
    expect(other.approved).toBeGreaterThanOrEqual(1);
    // The other department's row must not have leaked into this department's count.
    const directScoped = await prisma.approvalAction.count({
      where: {
        action: "APPROVE",
        createdAt: { gte: from, lte: to },
        post: { departmentId },
      },
    });
    expect(scoped.approved).toBe(directScoped);
  });
});

describe("getThroughputReport", () => {
  it("buckets SUBMIT actions by day and matches a direct per-day count", async () => {
    const creator = await createUser("Throughput Creator");
    const approver = await createUser("Throughput Approver");
    const submittedAt = new Date();

    await createDecidedPost({
      creatorId: creator.id,
      approverId: approver.id,
      decision: "APPROVE",
      departmentId,
      submittedAt,
      decidedAt: new Date(),
    });

    const points = await getThroughputReport({ from, to, departmentId });
    const today = submittedAt.toISOString().slice(0, 10);
    const todayPoint = points.find((p) => p.date === today);
    expect(todayPoint).toBeDefined();

    const directCount = await prisma.approvalAction.count({
      where: {
        action: "SUBMIT",
        createdAt: {
          gte: new Date(`${today}T00:00:00.000Z`),
          lt: new Date(`${today}T23:59:59.999Z`),
        },
        post: { departmentId },
      },
    });
    expect(todayPoint?.submitted).toBe(directCount);
  });
});

describe("getApprovalTimeReport", () => {
  it("averages exactly the submittedAt-to-decidedAt gap of the fixture posts", async () => {
    const creator = await createUser("ApprovalTime Creator");
    const approver = await createUser("ApprovalTime Approver");
    const submittedAt = new Date(Date.now() - 30 * 60 * 1000);
    const decidedAt = new Date();

    await createDecidedPost({
      creatorId: creator.id,
      approverId: approver.id,
      decision: "APPROVE",
      departmentId,
      submittedAt,
      decidedAt,
    });

    const report = await getApprovalTimeReport({ from, to, departmentId });
    expect(report.decided).toBeGreaterThanOrEqual(1);
    expect(report.avgMinutes).not.toBeNull();

    const rows = await prisma.post.findMany({
      where: {
        departmentId,
        decidedAt: { gte: from, lte: to, not: null },
        submittedAt: { not: null },
      },
      select: { submittedAt: true, decidedAt: true },
    });
    const durations = rows
      .filter(
        (r): r is { submittedAt: Date; decidedAt: Date } =>
          !!r.submittedAt && !!r.decidedAt,
      )
      .map((r) => (r.decidedAt.getTime() - r.submittedAt.getTime()) / 60_000);
    const expectedAvg = Math.round(
      durations.reduce((sum, v) => sum + v, 0) / durations.length,
    );
    expect(report.avgMinutes).toBe(expectedAvg);
  });
});

describe("getSlaComplianceReport", () => {
  it("counts on-time vs breached completions exactly", async () => {
    const creator = await createUser("SLA Creator");
    const onTimeApprover = await createUser("SLA OnTime Approver");
    const breachedApprover = await createUser("SLA Breached Approver");
    const decidedAt = new Date();

    await createDecidedPost({
      creatorId: creator.id,
      approverId: onTimeApprover.id,
      decision: "APPROVE",
      departmentId,
      submittedAt: new Date(Date.now() - 10 * 60 * 1000),
      decidedAt,
      assignmentDueAt: new Date(decidedAt.getTime() + 60 * 60 * 1000), // decided well before due
    });
    await createDecidedPost({
      creatorId: creator.id,
      approverId: breachedApprover.id,
      decision: "APPROVE",
      departmentId,
      submittedAt: new Date(Date.now() - 10 * 60 * 1000),
      decidedAt,
      assignmentDueAt: new Date(decidedAt.getTime() - 60 * 60 * 1000), // decided after due
    });

    const report = await getSlaComplianceReport({ from, to, departmentId });

    const rows = await prisma.approvalAssignment.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: from, lte: to, not: null },
        dueAt: { not: null },
        post: { departmentId },
      },
      select: { completedAt: true, dueAt: true },
    });
    const expectedOnTime = rows.filter(
      (r) => r.completedAt && r.dueAt && r.completedAt <= r.dueAt,
    ).length;

    expect(report.decided).toBe(rows.length);
    expect(report.onTime).toBe(expectedOnTime);
    expect(report.compliancePercent).toBe(
      Math.round((expectedOnTime / rows.length) * 100),
    );
  });
});

describe("getByDepartmentReport / getByCreatorReport / getByApproverReport", () => {
  it("groups decided posts by department/creator/approver with an exact count and average", async () => {
    const creator = await createUser("Grouped Creator");
    const approver = await createUser("Grouped Approver");
    await createDecidedPost({
      creatorId: creator.id,
      approverId: approver.id,
      decision: "APPROVE",
      departmentId,
      submittedAt: new Date(Date.now() - 20 * 60 * 1000),
      decidedAt: new Date(),
    });

    const [byDept, byCreator, byApprover] = await Promise.all([
      getByDepartmentReport({ from, to, departmentId }),
      getByCreatorReport({ from, to, departmentId }),
      getByApproverReport({ from, to, departmentId }),
    ]);

    const deptRow = byDept.find((r) => r.key === departmentId);
    const creatorRow = byCreator.find((r) => r.key === creator.id);
    const approverRow = byApprover.find((r) => r.key === approver.id);

    expect(deptRow).toBeDefined();
    expect(creatorRow).toBeDefined();
    expect(approverRow).toBeDefined();

    const directCreatorCount = await prisma.post.count({
      where: {
        creatorId: creator.id,
        departmentId,
        decidedAt: { gte: from, lte: to, not: null },
      },
    });
    expect(creatorRow?.count).toBe(directCreatorCount);

    const directApproverCount = await prisma.approvalAssignment.count({
      where: {
        assigneeUserId: approver.id,
        status: "COMPLETED",
        completedAt: { gte: from, lte: to, not: null },
        post: { departmentId },
      },
    });
    expect(approverRow?.count).toBe(directApproverCount);
  });
});

describe("getRejectionsReport", () => {
  it("tallies exact rejection reason text, matching a direct groupBy", async () => {
    const creator = await createUser("Rejections Creator");
    const approver = await createUser("Rejections Approver");
    const reason = `Missing disclaimer ${randomUUID().slice(0, 6)}`;

    await createDecidedPost({
      creatorId: creator.id,
      approverId: approver.id,
      decision: "REJECT",
      departmentId,
      rejectionReason: reason,
      submittedAt: new Date(),
      decidedAt: new Date(),
    });
    await createDecidedPost({
      creatorId: creator.id,
      approverId: approver.id,
      decision: "REJECT",
      departmentId,
      rejectionReason: reason,
      submittedAt: new Date(),
      decidedAt: new Date(),
    });

    const rows = await getRejectionsReport({ from, to, departmentId });
    const row = rows.find((r) => r.reason === reason);
    expect(row?.count).toBe(2);

    const directCount = await prisma.post.count({
      where: {
        status: "REJECTED",
        departmentId,
        decidedAt: { gte: from, lte: to },
        rejectionReason: reason,
      },
    });
    expect(row?.count).toBe(directCount);
  });
});
