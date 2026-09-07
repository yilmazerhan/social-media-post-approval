/**
 * `RETENTION_CLEANUP` — the `retention-cleanup` schedule (daily). Runs
 * every enabled `RetentionPolicy`; each one's own `dryRun` flag decides
 * whether anything actually happens, so nothing gets deleted until an
 * admin explicitly turns a policy's dry run off.
 */
import { registerJobHandler } from "@/jobs/queue";
import { runAllRetention } from "./service";

registerJobHandler("RETENTION_CLEANUP", async () => {
  await runAllRetention();
});
