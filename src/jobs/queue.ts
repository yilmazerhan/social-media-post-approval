/**
 * The PostgreSQL-backed job queue's claim/run mechanics — ARCHITECTURE.md
 * §7. This file only knows the generic lifecycle
 * (`PENDING -> RUNNING -> SUCCEEDED | FAILED -> PENDING | DEAD`); each
 * module registers handlers for the job types it owns (e.g.
 * `modules/attachments/jobs.ts` for `TEMP_FILE_CLEANUP` and
 * `ORPHAN_ATTACHMENT_CLEANUP`).
 */
import type { BackgroundJob, JobType } from "@/generated/prisma/client";
import { config } from "@/server/config";
import { prisma } from "@/server/db";
import { workerLogger as logger } from "@/server/logger";

export type JobHandler = (payload: unknown) => Promise<void>;

const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

/** `SELECT ... FOR UPDATE SKIP LOCKED` — safe for multiple concurrent workers. */
export async function claimNextJob(
  workerId: string,
): Promise<BackgroundJob | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: bigint; startedAt: Date | null }[]>`
      SELECT id, "startedAt" FROM "BackgroundJob"
      WHERE status = 'PENDING'::"JobStatus" AND "scheduledAt" <= now()
      ORDER BY priority, "scheduledAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const claimed = rows[0];
    if (!claimed) return null;

    const now = new Date();
    return tx.backgroundJob.update({
      where: { id: claimed.id },
      data: {
        status: "RUNNING",
        lockedBy: workerId,
        lockedAt: now,
        attempts: { increment: 1 },
        ...(claimed.startedAt ? {} : { startedAt: now }),
      },
    });
  });
}

/** Exponential backoff, capped at an hour. */
function backoffSeconds(attempts: number): number {
  return Math.min(2 ** attempts * 30, 3600);
}

export async function runClaimedJob(job: BackgroundJob): Promise<void> {
  const handler = handlers.get(job.type);
  if (!handler) {
    logger.error(
      { jobId: job.id.toString(), type: job.type },
      "no handler registered",
    );
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "DEAD",
        lastError: "No handler registered for this job type.",
      },
    });
    return;
  }

  try {
    await handler(job.payload);
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", completedAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { jobId: job.id.toString(), type: job.type, err },
      "job failed",
    );
    if (job.attempts >= job.maxAttempts) {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "DEAD", lastError: message },
      });
      return;
    }
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        lastError: message,
        scheduledAt: new Date(Date.now() + backoffSeconds(job.attempts) * 1000),
      },
    });
  }
}

/** A crashed worker's `RUNNING` jobs are reclaimed once their lock goes stale. */
export async function reclaimStaleJobs(): Promise<number> {
  const staleBefore = new Date(
    Date.now() - config.JOB_STALE_AFTER_SECONDS * 1000,
  );
  const result = await prisma.backgroundJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: staleBefore } },
    data: { status: "PENDING" },
  });
  return result.count;
}

/** One poll cycle: reclaim stale locks, then claim and run jobs up to `WORKER_CONCURRENCY`. */
export async function pollOnce(workerId: string): Promise<number> {
  await reclaimStaleJobs();
  let ran = 0;
  for (let i = 0; i < config.WORKER_CONCURRENCY; i++) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    await runClaimedJob(job);
    ran++;
  }
  return ran;
}
