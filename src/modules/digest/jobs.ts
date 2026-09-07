/**
 * `DAILY_DIGEST` job handler — registered by side effect, same pattern
 * every other job-owning module uses (`src/jobs/worker.ts` imports this).
 */
import { registerJobHandler } from "@/jobs/queue";
import { runDailyDigest } from "./service";

registerJobHandler("DAILY_DIGEST", async () => {
  await runDailyDigest();
});
