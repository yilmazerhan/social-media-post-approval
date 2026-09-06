/**
 * Background job administration — API.md's `/api/v1/admin/jobs*`,
 * `/job-schedules*`. Retry resets a `DEAD` (or still-`PENDING`, stuck)
 * job back to `PENDING` for the worker's own poll loop to pick up again
 * — this never runs a job inline; cancel only works before a worker has
 * claimed it.
 */
import type {
  BackgroundJob,
  JobStatus,
  JobType,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { NotFoundError, WorkflowError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import type { JobScheduleUpdateInput } from "./validation";

export interface ListJobsFilters {
  status?: JobStatus;
  type?: JobType;
  page: number;
  pageSize: number;
}

/** `BackgroundJob.id` is a Prisma `BigInt`, which `JSON.stringify` can't serialize — every response here carries it as a string instead. */
function serializeJob(job: BackgroundJob) {
  return { ...job, id: job.id.toString() };
}

export async function listJobs(filters: ListJobsFilters) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.backgroundJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.backgroundJob.count({ where }),
  ]);
  return { items: items.map(serializeJob), total };
}

export async function getJob(id: bigint) {
  const job = await prisma.backgroundJob.findUnique({ where: { id } });
  if (!job) throw new NotFoundError();
  return serializeJob(job);
}

export async function retryJob(id: bigint, actorId: string) {
  const job = await prisma.backgroundJob.findUnique({ where: { id } });
  if (!job) throw new NotFoundError();
  if (job.status !== "DEAD" && job.status !== "FAILED") {
    throw new WorkflowError(
      "Only a dead or failed job can be retried.",
      "INVALID_TRANSITION",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.backgroundJob.update({
      where: { id },
      data: {
        status: "PENDING",
        attempts: 0,
        lastError: null,
        scheduledAt: new Date(),
      },
    });
    await writeAudit(
      {
        actorId,
        action: "JOB_RETRIED",
        entityType: "BackgroundJob",
        entityId: id.toString(),
      },
      tx,
    );
    return serializeJob(updated);
  });
}

export async function cancelJob(id: bigint, actorId: string) {
  const job = await prisma.backgroundJob.findUnique({ where: { id } });
  if (!job) throw new NotFoundError();
  if (job.status !== "PENDING") {
    throw new WorkflowError(
      "Only a pending job can be cancelled.",
      "INVALID_TRANSITION",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.backgroundJob.update({
      where: { id },
      data: { status: "DEAD", lastError: "Cancelled by an administrator." },
    });
    await writeAudit(
      {
        actorId,
        action: "JOB_CANCELLED",
        entityType: "BackgroundJob",
        entityId: id.toString(),
      },
      tx,
    );
    return serializeJob(updated);
  });
}

export async function listJobSchedules() {
  return prisma.jobSchedule.findMany({ orderBy: { key: "asc" } });
}

export async function updateJobSchedule(
  key: string,
  input: JobScheduleUpdateInput,
  actorId: string,
) {
  const existing = await prisma.jobSchedule.findUnique({ where: { key } });
  if (!existing) throw new NotFoundError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.jobSchedule.update({
      where: { key },
      data: input,
    });
    await writeAudit(
      {
        actorId,
        action: "JOB_SCHEDULE_UPDATED",
        entityType: "JobSchedule",
        entityId: key,
      },
      tx,
    );
    return updated;
  });
}

/** `POST /job-schedules/:key/run-now` (API.md) — enqueues one immediate job of the schedule's own type, independent of its cron slot (doesn't touch `lastEnqueuedSlot`, so the next real tick still fires on schedule). */
export async function runJobScheduleNow(key: string, actorId: string) {
  const schedule = await prisma.jobSchedule.findUnique({ where: { key } });
  if (!schedule) throw new NotFoundError();

  return prisma.$transaction(async (tx) => {
    const job = await tx.backgroundJob.create({
      data: { type: schedule.jobType, payload: schedule.payload ?? {} },
    });
    await writeAudit(
      {
        actorId,
        action: "JOB_SCHEDULE_RUN_NOW",
        entityType: "JobSchedule",
        entityId: key,
      },
      tx,
    );
    return serializeJob(job);
  });
}
