/**
 * Background worker entry point (`npm run worker`). Independent OS
 * process from the web app; polls the PostgreSQL-backed job queue and
 * runs the local scheduler. See ARCHITECTURE.md §7.
 *
 * Job claiming and handlers land with the modules that need them
 * (Phase 3 onward). For now this proves the process boots under the
 * same fail-fast configuration as the web app and stays up.
 */
import { config } from "@/server/config";
import { workerLogger } from "@/server/logger";

function main() {
  workerLogger.info(
    {
      workerId: config.WORKER_ID,
      pollIntervalMs: config.WORKER_POLL_INTERVAL_MS,
    },
    "worker started",
  );

  const interval = setInterval(() => {
    workerLogger.debug({ workerId: config.WORKER_ID }, "tick");
  }, config.WORKER_POLL_INTERVAL_MS);

  const shutdown = (signal: string) => {
    workerLogger.info({ signal }, "worker shutting down");
    clearInterval(interval);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
