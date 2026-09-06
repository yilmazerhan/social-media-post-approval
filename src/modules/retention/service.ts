/**
 * Retention — IMPLEMENTATION_PLAN.md Phase 20, DATABASE.md §7's
 * `RetentionPolicy`/`RetentionRun`. Every target respects its own policy's
 * `dryRun` flag (default `true`, CONFIGURATION.md's `RETENTION_DRY_RUN`):
 * a dry run always counts candidates and never mutates anything; a real
 * run acts on exactly those candidates and records one `RetentionRun` row
 * either way.
 *
 * **POST is archived, not hard-deleted.** ARCHITECTURE.md's own state
 * diagram names `ARCHIVED` as a real `PostStatus` "reachable from any
 * terminal state via retention," and `Post.archivedAt` exists for exactly
 * this — a business record with legal/audit significance ("Approval
 * binds to a version," CLAUDE.md) gets moved out of the way, not erased.
 * This transition intentionally isn't in `state-machine.ts`'s
 * `ApprovalAction`-logged table (there's no human decision to log, and
 * `ApprovalActionType` has no ARCHIVE value) — it's recorded as a plain
 * `AuditLog` entry instead, actor `null` (a system event).
 *
 * **ATTACHMENT reports zero candidates here.** Phase 9's
 * `ORPHAN_ATTACHMENT_CLEANUP` job already owns attachment cleanup, and
 * already only ever touches `TEMPORARY`/soft-deleted rows — never one an
 * un-archived post's current or approved version still references. Two
 * jobs racing to delete the same attachment rows would be the one way to
 * violate "an attachment referenced by any version is never removed";
 * this target intentionally stays a no-op instead.
 */
import type { RetentionTarget, JobStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { writeAudit } from "@/modules/audit";

export interface RetentionTargetResult {
  target: RetentionTarget;
  dryRun: boolean;
  candidateCount: number;
  deletedCount: number;
  skippedCount: number;
  error: string | null;
}

async function countAndMaybeDelete(
  count: () => Promise<number>,
  deleteMany: () => Promise<number>,
  dryRun: boolean,
): Promise<{ candidateCount: number; deletedCount: number }> {
  const candidateCount = await count();
  if (dryRun || candidateCount === 0) {
    return { candidateCount, deletedCount: 0 };
  }
  const deletedCount = await deleteMany();
  return { candidateCount, deletedCount };
}

async function runForTarget(
  target: RetentionTarget,
  cutoff: Date,
  dryRun: boolean,
): Promise<{ candidateCount: number; deletedCount: number }> {
  switch (target) {
    case "AUDIT_LOG":
      return countAndMaybeDelete(
        () => prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } }),
        async () =>
          (
            await prisma.auditLog.deleteMany({
              where: { createdAt: { lt: cutoff } },
            })
          ).count,
        dryRun,
      );

    case "NOTIFICATION":
      return countAndMaybeDelete(
        () =>
          prisma.notification.count({ where: { createdAt: { lt: cutoff } } }),
        async () =>
          (
            await prisma.notification.deleteMany({
              where: { createdAt: { lt: cutoff } },
            })
          ).count,
        dryRun,
      );

    case "EMAIL_LOG":
      return countAndMaybeDelete(
        () => prisma.emailLog.count({ where: { queuedAt: { lt: cutoff } } }),
        async () =>
          (
            await prisma.emailLog.deleteMany({
              where: { queuedAt: { lt: cutoff } },
            })
          ).count,
        dryRun,
      );

    case "BACKGROUND_JOB": {
      const where = {
        status: { in: ["SUCCEEDED", "DEAD"] as JobStatus[] },
        updatedAt: { lt: cutoff },
      };
      return countAndMaybeDelete(
        () => prisma.backgroundJob.count({ where }),
        async () => (await prisma.backgroundJob.deleteMany({ where })).count,
        dryRun,
      );
    }

    case "SESSION": {
      const where = {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
      };
      return countAndMaybeDelete(
        () => prisma.session.count({ where }),
        async () => (await prisma.session.deleteMany({ where })).count,
        dryRun,
      );
    }

    case "COMMENT": {
      const where = { deletedAt: { not: null, lt: cutoff } };
      return countAndMaybeDelete(
        () => prisma.comment.count({ where }),
        async () => (await prisma.comment.deleteMany({ where })).count,
        dryRun,
      );
    }

    case "ATTACHMENT":
      return { candidateCount: 0, deletedCount: 0 };

    case "POST": {
      const candidates = await prisma.post.findMany({
        where: {
          status: { in: ["APPROVED", "REJECTED", "CANCELLED"] },
          OR: [{ decidedAt: { lt: cutoff } }, { updatedAt: { lt: cutoff } }],
        },
        select: { id: true },
      });
      if (dryRun) return { candidateCount: candidates.length, deletedCount: 0 };

      let archived = 0;
      for (const candidate of candidates) {
        await prisma.$transaction(async (tx) => {
          await tx.post.update({
            where: { id: candidate.id },
            data: { status: "ARCHIVED", archivedAt: new Date() },
          });
          await writeAudit(
            {
              action: "POST_ARCHIVED",
              entityType: "Post",
              entityId: candidate.id,
              postId: candidate.id,
            },
            tx,
          );
        });
        archived++;
      }
      return { candidateCount: candidates.length, deletedCount: archived };
    }
  }
}

export async function runRetentionForTarget(
  target: RetentionTarget,
  overrideDryRun?: boolean,
): Promise<RetentionTargetResult | null> {
  const policy = await prisma.retentionPolicy.findUnique({
    where: { target },
  });
  if (!policy || !policy.isEnabled) return null;

  const dryRun = overrideDryRun ?? policy.dryRun;
  const cutoff = new Date(
    Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000,
  );
  const startedAt = new Date();

  let candidateCount = 0;
  let deletedCount = 0;
  let error: string | null = null;
  try {
    ({ candidateCount, deletedCount } = await runForTarget(
      target,
      cutoff,
      dryRun,
    ));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  await prisma.retentionRun.create({
    data: {
      target,
      dryRun,
      startedAt,
      finishedAt: new Date(),
      candidateCount,
      deletedCount,
      skippedCount: 0,
      error,
      details: {},
    },
  });
  if (!dryRun && !error) {
    await prisma.retentionPolicy.update({
      where: { target },
      data: { lastRunAt: new Date() },
    });
  }

  return {
    target,
    dryRun,
    candidateCount,
    deletedCount,
    skippedCount: 0,
    error,
  };
}

export async function runAllRetention(
  overrideDryRun?: boolean,
): Promise<RetentionTargetResult[]> {
  const policies = await prisma.retentionPolicy.findMany({
    where: { isEnabled: true },
  });
  const results: RetentionTargetResult[] = [];
  for (const policy of policies) {
    const result = await runRetentionForTarget(policy.target, overrideDryRun);
    if (result) results.push(result);
  }
  return results;
}
