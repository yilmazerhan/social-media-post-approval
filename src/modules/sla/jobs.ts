/**
 * `SLA_CHECK` and `SLA_ESCALATE` — IMPLEMENTATION_PLAN.md Phase 19.
 * Both are read-mostly with respect to workflow state: neither ever
 * touches `Post.status` or `ApprovalAssignment.status` — "an expired SLA
 * never changes a post's status" is a hard rule, not just an exit test.
 * `SLA_CHECK` (the `sla-check` schedule, every 15 minutes) only writes
 * notifications/emails and enqueues `SLA_ESCALATE` jobs; `SLA_ESCALATE`
 * only writes `escalatedAt`/`escalationLevel` plus its own notification.
 */
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { registerJobHandler } from "@/jobs/queue";
import { writeNotification, enqueueGroupFanout } from "@/modules/notifications";
import { writeAudit } from "@/modules/audit";

const OPEN_STATUSES = ["PENDING", "IN_PROGRESS"] as const;

async function alreadyNotified(
  type: "SLA_WARNING" | "SLA_OVERDUE",
  assignmentId: string,
): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: { type, entityType: "ApprovalAssignment", entityId: assignmentId },
    select: { id: true },
  });
  return !!existing;
}

registerJobHandler("SLA_CHECK", async () => {
  const now = new Date();

  const dueForWarning = await prisma.approvalAssignment.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      warningAt: { lte: now },
      dueAt: { gt: now },
    },
    include: { post: { select: { id: true, title: true } } },
  });
  for (const assignment of dueForWarning) {
    if (await alreadyNotified("SLA_WARNING", assignment.id)) continue;
    const notification = {
      type: "SLA_WARNING" as const,
      title: `Due soon: ${assignment.post.title}`,
      body: `${assignment.post.title} is approaching its review deadline.`,
      entityType: "ApprovalAssignment",
      entityId: assignment.id,
      postId: assignment.post.id,
      email: {
        templateKey: "sla_warning",
        variables: {
          postTitle: assignment.post.title,
          dueAt: assignment.dueAt?.toISOString() ?? "",
          reviewUrl: `${config.APP_URL}/approvals/${assignment.post.id}`,
        },
      },
    };
    if (assignment.assigneeUserId) {
      await writeNotification({
        ...notification,
        recipientId: assignment.assigneeUserId,
      });
    } else if (assignment.assigneeGroupId) {
      await enqueueGroupFanout({
        ...notification,
        groupId: assignment.assigneeGroupId,
      });
    }
  }

  const overdue = await prisma.approvalAssignment.findMany({
    where: { status: { in: [...OPEN_STATUSES] }, dueAt: { lte: now } },
    include: {
      post: { select: { id: true, title: true, slaPolicyId: true } },
    },
  });
  for (const assignment of overdue) {
    if (!(await alreadyNotified("SLA_OVERDUE", assignment.id))) {
      const notification = {
        type: "SLA_OVERDUE" as const,
        title: `Overdue: ${assignment.post.title}`,
        body: `${assignment.post.title} has passed its review deadline.`,
        entityType: "ApprovalAssignment",
        entityId: assignment.id,
        postId: assignment.post.id,
      };
      if (assignment.assigneeUserId) {
        await writeNotification({
          ...notification,
          recipientId: assignment.assigneeUserId,
        });
      } else if (assignment.assigneeGroupId) {
        await enqueueGroupFanout({
          ...notification,
          groupId: assignment.assigneeGroupId,
        });
      }
    }

    if (assignment.escalationLevel > 0 || !assignment.post.slaPolicyId) {
      continue;
    }
    const policy = await prisma.slaPolicy.findUnique({
      where: { id: assignment.post.slaPolicyId },
      select: { escalationAfterMinutes: true },
    });
    if (!policy?.escalationAfterMinutes) continue;
    const escalateAt = new Date(
      assignment.assignedAt.getTime() + policy.escalationAfterMinutes * 60_000,
    );
    if (now < escalateAt) continue;

    await prisma.backgroundJob
      .create({
        data: {
          type: "SLA_ESCALATE",
          payload: { assignmentId: assignment.id },
          idempotencyKey: `sla-escalate:${assignment.id}`,
        },
      })
      .catch((err) => {
        if (
          !err ||
          typeof err !== "object" ||
          (err as { code?: string }).code !== "P2002"
        ) {
          throw err;
        }
        // Already enqueued by a previous tick.
      });
  }
});

function isEscalatePayload(value: unknown): value is { assignmentId: string } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { assignmentId?: unknown }).assignmentId === "string"
  );
}

registerJobHandler("SLA_ESCALATE", async (payload) => {
  if (!isEscalatePayload(payload)) {
    throw new Error("SLA_ESCALATE payload missing assignmentId.");
  }

  const assignment = await prisma.approvalAssignment.findUnique({
    where: { id: payload.assignmentId },
    include: {
      post: {
        select: {
          id: true,
          title: true,
          departmentId: true,
          slaPolicyId: true,
        },
      },
    },
  });
  if (!assignment || assignment.escalationLevel > 0) return;
  if (!assignment.post.slaPolicyId) return;

  const policy = await prisma.slaPolicy.findUnique({
    where: { id: assignment.post.slaPolicyId },
  });
  if (!policy?.escalationTargetType) return;

  let targetUserId: string | null = null;
  let targetGroupId: string | null = null;
  switch (policy.escalationTargetType) {
    case "USER":
      targetUserId = policy.escalationUserId;
      break;
    case "GROUP":
      targetGroupId = policy.escalationGroupId;
      break;
    case "DEPARTMENT_MANAGER": {
      if (!assignment.post.departmentId) break;
      const department = await prisma.department.findUnique({
        where: { id: assignment.post.departmentId },
        select: { managerId: true },
      });
      targetUserId = department?.managerId ?? null;
      break;
    }
  }
  if (!targetUserId && !targetGroupId) return;

  await prisma.$transaction(async (tx) => {
    await tx.approvalAssignment.update({
      where: { id: assignment.id },
      data: { escalationLevel: { increment: 1 }, escalatedAt: new Date() },
    });
    await writeAudit(
      {
        action: "ASSIGNMENT_ESCALATED",
        entityType: "ApprovalAssignment",
        entityId: assignment.id,
        postId: assignment.post.id,
        metadata: { escalationTargetType: policy.escalationTargetType },
      },
      tx,
    );
  });

  const notification = {
    type: "ESCALATION" as const,
    title: `Escalated: ${assignment.post.title}`,
    body: `${assignment.post.title} is overdue and has been escalated to you.`,
    entityType: "ApprovalAssignment",
    entityId: assignment.id,
    postId: assignment.post.id,
    email: {
      templateKey: "sla_escalation",
      variables: {
        postTitle: assignment.post.title,
        reviewUrl: `${config.APP_URL}/approvals/${assignment.post.id}`,
      },
    },
  };
  if (targetUserId) {
    await writeNotification({ ...notification, recipientId: targetUserId });
  } else if (targetGroupId) {
    await enqueueGroupFanout({ ...notification, groupId: targetGroupId });
  }
});
