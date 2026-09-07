/**
 * Read-only aggregates for the approver and admin dashboards —
 * UI_UX_SPEC.md §6. "Due soon" and "overdue" read the same `warningAt` /
 * `dueAt` columns the SLA module will compute at assignment time
 * (DATABASE.md §5) rather than an ad-hoc threshold picked here.
 */
import type { AssignmentStatus } from "@/generated/prisma/client";
import type { AuthorizedUser } from "@/modules/authorization";
import { prisma } from "@/server/db";

const OPEN_STATUSES: AssignmentStatus[] = ["PENDING", "IN_PROGRESS"];
const RECENTLY_COMPLETED_WINDOW_DAYS = 7;
const SLA_COMPLIANCE_WINDOW_DAYS = 30;
const AVG_APPROVAL_TIME_WINDOW_DAYS = 30;

/** Shared by the dashboard aggregates and the queue listing (queue.ts) — the one definition of "my open assignments." */
export function assignedToMeFilter(user: AuthorizedUser) {
  return {
    OR: [
      { assigneeUserId: user.id },
      { assigneeGroupId: { in: Array.from(user.groupIds) } },
    ],
  };
}

export interface ApproverCounts {
  pending: number;
  dueSoon: number;
  overdue: number;
  recentlyCompleted: number;
}

export interface SlaComplianceSummary {
  decided: number;
  onTime: number;
  /** null when there is nothing decided yet to compute a rate from. */
  compliancePercent: number | null;
}

export interface ApproverDashboard {
  counts: ApproverCounts;
  slaCompliance: SlaComplianceSummary;
}

/** UI_UX_SPEC.md §6's approver stat cards, scoped to assignments routed to this user or their groups. */
export async function getApproverDashboard(
  user: AuthorizedUser,
): Promise<ApproverDashboard> {
  const now = new Date();
  const recentlyCompletedSince = new Date(
    now.getTime() - RECENTLY_COMPLETED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const slaWindowSince = new Date(
    now.getTime() - SLA_COMPLIANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const assignedToMe = assignedToMeFilter(user);

  const [pending, dueSoon, overdue, recentlyCompleted, decidedInWindow] =
    await Promise.all([
      prisma.approvalAssignment.count({
        where: { ...assignedToMe, status: { in: OPEN_STATUSES } },
      }),
      prisma.approvalAssignment.count({
        where: {
          AND: [
            assignedToMe,
            { status: { in: OPEN_STATUSES } },
            { warningAt: { lte: now } },
            { OR: [{ dueAt: null }, { dueAt: { gt: now } }] },
          ],
        },
      }),
      prisma.approvalAssignment.count({
        where: {
          ...assignedToMe,
          status: { in: OPEN_STATUSES },
          dueAt: { lte: now },
        },
      }),
      prisma.approvalAssignment.count({
        where: {
          ...assignedToMe,
          status: "COMPLETED",
          completedAt: { gte: recentlyCompletedSince },
        },
      }),
      prisma.approvalAssignment.findMany({
        where: {
          ...assignedToMe,
          status: "COMPLETED",
          completedAt: { gte: slaWindowSince, not: null },
          dueAt: { not: null },
        },
        select: { dueAt: true, completedAt: true },
      }),
    ]);

  const decided = decidedInWindow.length;
  const onTime = decidedInWindow.filter(
    (a) => a.completedAt && a.dueAt && a.completedAt <= a.dueAt,
  ).length;

  return {
    counts: { pending, dueSoon, overdue, recentlyCompleted },
    slaCompliance: {
      decided,
      onTime,
      compliancePercent:
        decided > 0 ? Math.round((onTime / decided) * 100) : null,
    },
  };
}

export interface SystemApprovalStats {
  pending: number;
  overdue: number;
  /** null when nothing has been decided in the averaging window yet. */
  avgApprovalMinutes: number | null;
}

/** UI_UX_SPEC.md §6's admin approval tiles — system-wide, not scoped to one approver. */
export async function getSystemApprovalStats(): Promise<SystemApprovalStats> {
  const now = new Date();
  const since = new Date(
    now.getTime() - AVG_APPROVAL_TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [pending, overdue, decidedInWindow] = await Promise.all([
    prisma.approvalAssignment.count({
      where: { status: { in: OPEN_STATUSES } },
    }),
    prisma.approvalAssignment.count({
      where: { status: { in: OPEN_STATUSES }, dueAt: { lte: now } },
    }),
    prisma.approvalAssignment.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: since, not: null },
      },
      select: { assignedAt: true, completedAt: true },
    }),
  ]);

  const durationsMinutes = decidedInWindow
    .filter(
      (a): a is { assignedAt: Date; completedAt: Date } => !!a.completedAt,
    )
    .map((a) => (a.completedAt.getTime() - a.assignedAt.getTime()) / 60_000);

  const avgApprovalMinutes =
    durationsMinutes.length > 0
      ? Math.round(
          durationsMinutes.reduce((sum, m) => sum + m, 0) /
            durationsMinutes.length,
        )
      : null;

  return { pending, overdue, avgApprovalMinutes };
}
