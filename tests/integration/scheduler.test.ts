import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { evaluateSchedules } from "@/jobs/scheduler";

/**
 * Phase 18's scheduler foundation (ARCHITECTURE.md §7): a due
 * `JobSchedule` enqueues exactly one job per slot, guarded by
 * `BackgroundJob.idempotencyKey`'s own unique constraint so a repeated
 * tick within the same slot never double-enqueues — even before this
 * phase's own `DAILY_DIGEST` handler runs.
 */

const createdScheduleIds: string[] = [];
const createdJobIds: bigint[] = [];

afterAll(async () => {
  if (createdJobIds.length) {
    await prisma.backgroundJob.deleteMany({
      where: { id: { in: createdJobIds } },
    });
  }
  if (createdScheduleIds.length) {
    await prisma.jobSchedule.deleteMany({
      where: { id: { in: createdScheduleIds } },
    });
  }
  await prisma.$disconnect();
});

describe("evaluateSchedules", () => {
  it("enqueues one job for a due schedule, and a repeated tick in the same slot does not double-enqueue", async () => {
    const schedule = await prisma.jobSchedule.create({
      data: {
        key: `scheduler-test-${randomUUID()}`,
        jobType: "SESSION_CLEANUP",
        // every minute — guaranteed due by the time this runs.
        cronExpression: "* * * * *",
        timezone: "UTC",
        isEnabled: true,
      },
    });
    createdScheduleIds.push(schedule.id);

    const now = new Date();
    await evaluateSchedules(now);
    await evaluateSchedules(now);

    const jobs = await prisma.backgroundJob.findMany({
      where: { idempotencyKey: { startsWith: `${schedule.key}:` } },
    });
    for (const job of jobs) createdJobIds.push(job.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].type).toBe("SESSION_CLEANUP");

    const updated = await prisma.jobSchedule.findUniqueOrThrow({
      where: { id: schedule.id },
    });
    expect(updated.lastEnqueuedSlot).not.toBeNull();
    expect(updated.lastRunAt).not.toBeNull();
    expect(updated.nextRunAt).not.toBeNull();
  });

  it("does not enqueue anything for a disabled schedule", async () => {
    const schedule = await prisma.jobSchedule.create({
      data: {
        key: `scheduler-disabled-test-${randomUUID()}`,
        jobType: "SESSION_CLEANUP",
        cronExpression: "* * * * *",
        timezone: "UTC",
        isEnabled: false,
      },
    });
    createdScheduleIds.push(schedule.id);

    await evaluateSchedules(new Date());

    const jobs = await prisma.backgroundJob.findMany({
      where: { idempotencyKey: { startsWith: `${schedule.key}:` } },
    });
    expect(jobs).toHaveLength(0);
  });
});
