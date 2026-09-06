/**
 * Evaluates `JobSchedule` rows on each tick and enqueues due jobs —
 * ARCHITECTURE.md §7: "each due schedule enqueues a job with an
 * idempotency key derived from its slot, so a duplicated tick cannot
 * double-run it." That guard is the `BackgroundJob.idempotencyKey`
 * unique constraint itself, not an in-process check — the worker is
 * "stateless and independently restartable," so more than one instance
 * can legitimately tick at once.
 */
import { CronExpressionParser } from "cron-parser";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { workerLogger as logger } from "@/server/logger";

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

/** Most recent slot at-or-before `now`, and the next slot after it — both computed fresh since the iterator is stateful. */
function occurrences(
  cronExpression: string,
  timezone: string,
  now: Date,
): { prev: Date; next: Date } {
  const prev = CronExpressionParser.parse(cronExpression, {
    currentDate: now,
    tz: timezone,
  })
    .prev()
    .toDate();
  const next = CronExpressionParser.parse(cronExpression, {
    currentDate: now,
    tz: timezone,
  })
    .next()
    .toDate();
  return { prev, next };
}

export async function evaluateSchedules(now: Date = new Date()): Promise<void> {
  const schedules = await prisma.jobSchedule.findMany({
    where: { isEnabled: true },
  });

  for (const schedule of schedules) {
    let prev: Date;
    let next: Date;
    try {
      ({ prev, next } = occurrences(
        schedule.cronExpression,
        schedule.timezone,
        now,
      ));
    } catch (err) {
      logger.error(
        { scheduleKey: schedule.key, err },
        "invalid cron expression; skipping this schedule",
      );
      continue;
    }

    const slotKey = prev.toISOString();
    if (schedule.lastEnqueuedSlot === slotKey) {
      continue;
    }

    try {
      await prisma.backgroundJob.create({
        data: {
          type: schedule.jobType,
          payload: (schedule.payload ?? {}) as unknown as Prisma.InputJsonValue,
          idempotencyKey: `${schedule.key}:${slotKey}`,
        },
      });
    } catch (err) {
      if (!isUniqueConstraintViolation(err)) throw err;
      // Another worker instance already enqueued this exact slot.
    }

    await prisma.jobSchedule.update({
      where: { id: schedule.id },
      data: { lastEnqueuedSlot: slotKey, lastRunAt: now, nextRunAt: next },
    });
  }
}
