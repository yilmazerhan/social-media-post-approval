/**
 * Reporting aggregates — API.md's `GET /api/v1/reports/*`, UI_UX_SPEC.md's
 * `/reports` screen. Every function here answers one report card; each
 * follows the same computation `modules/approvals/dashboard.ts` already
 * uses and tests for "average time"/"SLA compliance" (fetch the relevant
 * timestamp pairs, average in application code) rather than inventing a
 * second way to compute the same numbers — Prisma's `groupBy` can count
 * and sum a stored numeric column, but a duration here is always the
 * difference of two `DateTime` columns, which it cannot aggregate directly.
 *
 * `from`/`to` bound a different timestamp column per report, documented on
 * each function — there's no one column that means "when this report's
 * event happened" across `Post`/`ApprovalAction`/`ApprovalAssignment`.
 */
import type { ApprovalActionType, PostStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { postFilter, type ReportFilters } from "./filters";

function average(durationsMs: number[]): number | null {
  if (durationsMs.length === 0) return null;
  return Math.round(
    durationsMs.reduce((sum, v) => sum + v, 0) / durationsMs.length,
  );
}

export interface SummaryReport {
  submitted: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  /** A live count of currently-open, past-due assignments — not windowed by `from`/`to`, since "overdue" describes now, not history. */
  overdue: number;
}

/** Counts of each decision type recorded in `[from, to]` — one `ApprovalAction` row per event, so this is an exact count, not a derived estimate. */
export async function getSummaryReport(
  filters: ReportFilters,
): Promise<SummaryReport> {
  const actionWhere = (action: ApprovalActionType) => ({
    action,
    createdAt: { gte: filters.from, lte: filters.to },
    post: postFilter(filters),
  });

  const [submitted, approved, rejected, changesRequested, overdue] =
    await Promise.all([
      prisma.approvalAction.count({ where: actionWhere("SUBMIT") }),
      prisma.approvalAction.count({ where: actionWhere("APPROVE") }),
      prisma.approvalAction.count({ where: actionWhere("REJECT") }),
      prisma.approvalAction.count({ where: actionWhere("REQUEST_CHANGES") }),
      prisma.approvalAssignment.count({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueAt: { lte: new Date() },
          post: postFilter(filters),
        },
      }),
    ]);

  return { submitted, approved, rejected, changesRequested, overdue };
}

export interface ThroughputPoint {
  date: string;
  submitted: number;
}

/** Daily submission volume in `[from, to]` — one point per calendar day (UTC) that had at least one `SUBMIT` action. */
export async function getThroughputReport(
  filters: ReportFilters,
): Promise<ThroughputPoint[]> {
  const submissions = await prisma.approvalAction.findMany({
    where: {
      action: "SUBMIT",
      createdAt: { gte: filters.from, lte: filters.to },
      post: postFilter(filters),
    },
    select: { createdAt: true },
  });

  const byDay = new Map<string, number>();
  for (const s of submissions) {
    const day = s.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, submitted]) => ({ date, submitted }));
}

export interface ApprovalTimeReport {
  decided: number;
  /** Minutes from `submittedAt` to `decidedAt`, averaged; `null` when nothing decided in range. */
  avgMinutes: number | null;
}

/** Posts decided (`decidedAt` in `[from, to]`) — average wall-clock time from submission to decision. */
export async function getApprovalTimeReport(
  filters: ReportFilters,
): Promise<ApprovalTimeReport> {
  const decided = await prisma.post.findMany({
    where: {
      decidedAt: { gte: filters.from, lte: filters.to, not: null },
      submittedAt: { not: null },
      ...postFilter(filters),
    },
    select: { submittedAt: true, decidedAt: true },
  });

  const durations = decided
    .filter(
      (p): p is { submittedAt: Date; decidedAt: Date } =>
        !!p.submittedAt && !!p.decidedAt,
    )
    .map((p) => (p.decidedAt.getTime() - p.submittedAt.getTime()) / 60_000);

  return { decided: decided.length, avgMinutes: average(durations) };
}

export interface SlaComplianceReport {
  decided: number;
  onTime: number;
  compliancePercent: number | null;
}

/** Assignments completed (`completedAt` in `[from, to]`) with a `dueAt` — the same on-time-vs-breach computation `approvals/dashboard.ts` uses for the live dashboard tile. */
export async function getSlaComplianceReport(
  filters: ReportFilters,
): Promise<SlaComplianceReport> {
  const completed = await prisma.approvalAssignment.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: filters.from, lte: filters.to, not: null },
      dueAt: { not: null },
      post: postFilter(filters),
    },
    select: { completedAt: true, dueAt: true },
  });

  const decided = completed.length;
  const onTime = completed.filter(
    (a) => a.completedAt && a.dueAt && a.completedAt <= a.dueAt,
  ).length;

  return {
    decided,
    onTime,
    compliancePercent:
      decided > 0 ? Math.round((onTime / decided) * 100) : null,
  };
}

export interface GroupedVolumeRow {
  key: string;
  label: string;
  count: number;
  avgApprovalMinutes: number | null;
}

/** Decided posts (`decidedAt` in `[from, to]`) grouped by department — volume and average approval time per department. */
export async function getByDepartmentReport(
  filters: ReportFilters,
): Promise<GroupedVolumeRow[]> {
  const decided = await prisma.post.findMany({
    where: {
      decidedAt: { gte: filters.from, lte: filters.to, not: null },
      ...postFilter(filters),
    },
    select: {
      departmentId: true,
      department: { select: { name: true } },
      submittedAt: true,
      decidedAt: true,
    },
  });
  return groupByKey(
    decided.map((p) => ({
      key: p.departmentId ?? "none",
      label: p.department?.name ?? "No department",
      submittedAt: p.submittedAt,
      decidedAt: p.decidedAt,
    })),
  );
}

/** Decided posts (`decidedAt` in `[from, to]`) grouped by creator — volume and average approval time per creator. */
export async function getByCreatorReport(
  filters: ReportFilters,
): Promise<GroupedVolumeRow[]> {
  const decided = await prisma.post.findMany({
    where: {
      decidedAt: { gte: filters.from, lte: filters.to, not: null },
      ...postFilter(filters),
    },
    select: {
      creatorId: true,
      creator: { select: { displayName: true } },
      submittedAt: true,
      decidedAt: true,
    },
  });
  return groupByKey(
    decided.map((p) => ({
      key: p.creatorId,
      label: p.creator.displayName,
      submittedAt: p.submittedAt,
      decidedAt: p.decidedAt,
    })),
  );
}

/** Assignments completed (`completedAt` in `[from, to]`) grouped by the approver they were assigned to — volume and average assignment-to-completion time per approver. Group-level assignments (no `assigneeUserId`) are excluded — there's no single approver to attribute them to. */
export async function getByApproverReport(
  filters: ReportFilters,
): Promise<GroupedVolumeRow[]> {
  const completed = await prisma.approvalAssignment.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: filters.from, lte: filters.to, not: null },
      assigneeUserId: { not: null },
      post: postFilter(filters),
    },
    select: {
      assigneeUserId: true,
      assigneeUser: { select: { displayName: true } },
      assignedAt: true,
      completedAt: true,
    },
  });
  return groupByKey(
    completed
      .filter(
        (a): a is typeof a & { assigneeUserId: string } =>
          a.assigneeUserId !== null,
      )
      .map((a) => ({
        key: a.assigneeUserId,
        label: a.assigneeUser?.displayName ?? "Unknown",
        submittedAt: a.assignedAt,
        decidedAt: a.completedAt,
      })),
  );
}

function groupByKey(
  rows: {
    key: string;
    label: string;
    submittedAt: Date | null;
    decidedAt: Date | null;
  }[],
): GroupedVolumeRow[] {
  const groups = new Map<
    string,
    { label: string; count: number; durations: number[] }
  >();
  for (const row of rows) {
    const group = groups.get(row.key) ?? {
      label: row.label,
      count: 0,
      durations: [],
    };
    group.count++;
    if (row.submittedAt && row.decidedAt) {
      group.durations.push(
        (row.decidedAt.getTime() - row.submittedAt.getTime()) / 60_000,
      );
    }
    groups.set(row.key, group);
  }
  return Array.from(groups.entries())
    .map(([key, g]) => ({
      key,
      label: g.label,
      count: g.count,
      avgApprovalMinutes: average(g.durations),
    }))
    .sort((a, b) => b.count - a.count);
}

export interface RejectionReasonRow {
  reason: string;
  count: number;
}

const REJECTED_STATUS: PostStatus = "REJECTED";

/** Rejected posts (`decidedAt` in `[from, to]`) grouped by their exact free-text `rejectionReason` — reasons are whatever an approver typed, not a fixed enum, so this is a plain tally rather than a bucketed classification. */
export async function getRejectionsReport(
  filters: ReportFilters,
): Promise<RejectionReasonRow[]> {
  const rejected = await prisma.post.findMany({
    where: {
      status: REJECTED_STATUS,
      decidedAt: { gte: filters.from, lte: filters.to, not: null },
      ...postFilter(filters),
    },
    select: { rejectionReason: true },
  });

  const byReason = new Map<string, number>();
  for (const p of rejected) {
    const reason = p.rejectionReason?.trim() || "(no reason given)";
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }

  return Array.from(byReason.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
