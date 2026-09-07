/**
 * Daily approval digest — IMPLEMENTATION_PLAN.md's Phase 18: "one
 * consolidated digest per approver ... with the pending list, waiting
 * times, SLA state and direct review links." Driven by the `daily-digest`
 * `JobSchedule` row (`src/jobs/scheduler.ts` enqueues its `DAILY_DIGEST`
 * job once per due slot); `runDailyDigest` is what that job runs.
 *
 * "SLA state" reads the same `dueAt` column the queue/dashboard already
 * do — always `null` until Phase 19 computes it (ARCHITECTURE.md), so an
 * assignment without one just shows no due date yet, not a fake one.
 */
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { sendTemplatedEmail, escapeHtml, rawHtml } from "@/modules/email";

const OPEN_STATUSES = ["PENDING", "IN_PROGRESS"] as const;

interface PendingItem {
  postId: string;
  title: string;
  reference: string;
  submittedAt: Date | null;
  dueAt: Date | null;
}

function renderItemsHtml(items: PendingItem[]): string {
  const rows = items
    .map((item) => {
      const waiting = item.submittedAt
        ? formatDistanceToNow(item.submittedAt, { addSuffix: false })
        : "unknown time";
      const dueText = item.dueAt
        ? `, due ${item.dueAt.toLocaleDateString()}`
        : "";
      const href = `${config.APP_URL}/approvals/${item.postId}`;
      const label = escapeHtml(item.title || item.reference);
      return `<li><a href="${escapeHtml(href)}">${label}</a> — waiting ${waiting}${dueText}</li>`;
    })
    .join("");
  return `<ul>${rows}</ul>`;
}

export interface RunDailyDigestResult {
  sent: number;
}

export async function runDailyDigest(
  now: Date = new Date(),
): Promise<RunDailyDigestResult> {
  if (!config.DIGEST_ENABLED) return { sent: 0 };

  const openAssignments = await prisma.approvalAssignment.findMany({
    where: { status: { in: [...OPEN_STATUSES] } },
    select: {
      assigneeUserId: true,
      assigneeGroupId: true,
      dueAt: true,
      postId: true,
      post: { select: { title: true, reference: true, submittedAt: true } },
    },
  });
  if (openAssignments.length === 0) return { sent: 0 };

  const groupIds = [
    ...new Set(
      openAssignments
        .map((a) => a.assigneeGroupId)
        .filter((id): id is string => !!id),
    ),
  ];
  const memberships =
    groupIds.length > 0
      ? await prisma.userGroup.findMany({
          where: { groupId: { in: groupIds } },
          select: { userId: true, groupId: true },
        })
      : [];
  const membersByGroup = new Map<string, string[]>();
  for (const m of memberships) {
    const list = membersByGroup.get(m.groupId) ?? [];
    list.push(m.userId);
    membersByGroup.set(m.groupId, list);
  }

  const itemsByUser = new Map<string, PendingItem[]>();
  for (const a of openAssignments) {
    const recipients = a.assigneeUserId
      ? [a.assigneeUserId]
      : a.assigneeGroupId
        ? (membersByGroup.get(a.assigneeGroupId) ?? [])
        : [];
    const item: PendingItem = {
      postId: a.postId,
      title: a.post.title,
      reference: a.post.reference,
      submittedAt: a.post.submittedAt,
      dueAt: a.dueAt,
    };
    for (const userId of recipients) {
      const list = itemsByUser.get(userId) ?? [];
      list.push(item);
      itemsByUser.set(userId, list);
    }
  }

  const dateSlot = now.toISOString().slice(0, 10);
  let sent = 0;

  for (const [userId, items] of itemsByUser) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, status: true, deletedAt: true },
    });
    if (!user || user.status !== "ACTIVE" || user.deletedAt) continue;

    await sendTemplatedEmail({
      templateKey: "daily_digest",
      to: user.email,
      variables: {
        pendingCount: items.length,
        items: rawHtml(renderItemsHtml(items)),
      },
      userId,
      idempotencyKey: `digest:${dateSlot}:${userId}`,
    });
    sent++;
  }

  return { sent };
}
