/**
 * `npm run job:enqueue -- <TYPE>` — enqueues one BackgroundJob, for use
 * from cron/systemd when SCHEDULER_ENABLED=false. See DEPLOYMENT.md §7.
 */
import { prisma } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";

const VALID_TYPES = new Set([
  "EMAIL_SEND",
  "DAILY_DIGEST",
  "SLA_CHECK",
  "SLA_ESCALATE",
  "RETENTION_CLEANUP",
  "ORPHAN_ATTACHMENT_CLEANUP",
  "TEMP_FILE_CLEANUP",
  "SESSION_CLEANUP",
  "NOTIFICATION_FANOUT",
]);

async function main() {
  const type = process.argv[2];
  if (!type || !VALID_TYPES.has(type)) {
    console.error(
      `Usage: npm run job:enqueue -- <TYPE>\nValid types: ${[...VALID_TYPES].join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  // One idempotency key per calendar minute so a duplicate cron tick
  // within the same minute cannot double-enqueue the same job type.
  const slot = new Date().toISOString().slice(0, 16);
  const idempotencyKey = `${type}:${slot}`;

  const job = await prisma.backgroundJob.upsert({
    where: { idempotencyKey },
    create: {
      type: type as Prisma.BackgroundJobCreateInput["type"],
      payload: {},
      idempotencyKey,
    },
    update: {},
  });

  console.log(
    `Enqueued ${type} as job #${job.id} (idempotencyKey=${idempotencyKey}).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
