/**
 * Background worker entry point (`npm run worker`). Independent OS
 * process from the web app; polls the PostgreSQL-backed job queue and
 * runs the local scheduler. See ARCHITECTURE.md §7.
 *
 * Each module that owns a job type registers its handler(s) by side
 * effect — imported here so `queue.ts`'s handler map is populated before
 * the first poll. More modules (email, SLA, retention, ...) add their own
 * import as later phases give them a job type.
 */
import "@/modules/attachments/jobs";
import "@/modules/notifications/jobs";
import "@/modules/email/jobs";
import "@/modules/digest/jobs";
import { config } from "@/server/config";
import { workerLogger } from "@/server/logger";
import { pollOnce } from "./queue";
import { evaluateSchedules } from "./scheduler";

let stopping = false;

async function tick() {
  if (stopping) return;
  try {
    const ran = await pollOnce(config.WORKER_ID);
    if (ran > 0) {
      workerLogger.info({ workerId: config.WORKER_ID, ran }, "processed jobs");
    }
  } catch (err) {
    workerLogger.error({ err }, "poll cycle failed");
  }
}

async function schedulerTick() {
  if (stopping) return;
  try {
    await evaluateSchedules();
  } catch (err) {
    workerLogger.error({ err }, "scheduler tick failed");
  }
}

function main() {
  workerLogger.info(
    {
      workerId: config.WORKER_ID,
      pollIntervalMs: config.WORKER_POLL_INTERVAL_MS,
      schedulerEnabled: config.SCHEDULER_ENABLED,
    },
    "worker started",
  );

  const interval = setInterval(() => {
    void tick();
  }, config.WORKER_POLL_INTERVAL_MS);

  const schedulerInterval = config.SCHEDULER_ENABLED
    ? setInterval(() => {
        void schedulerTick();
      }, config.SCHEDULER_TICK_SECONDS * 1000)
    : null;

  const shutdown = (signal: string) => {
    workerLogger.info({ signal }, "worker shutting down");
    stopping = true;
    clearInterval(interval);
    if (schedulerInterval) clearInterval(schedulerInterval);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
