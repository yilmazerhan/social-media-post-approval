import { NextResponse } from "next/server";
import {
  checkDatabase,
  checkStorage,
  checkWorker,
  checkEmail,
} from "@/server/health";

/**
 * Dependency readiness — ARCHITECTURE.md §9 ("database, storage
 * writability, worker heartbeat, SMTP configuration presence"),
 * DEPLOYMENT.md §8/§12 ("`/api/ready` reports storage unhealthy" is the
 * documented troubleshooting entry for a non-writable `STORAGE_PATH`).
 * Used after a deploy/migration to gate traffic, unlike `/api/health`'s
 * pure liveness check.
 *
 * Only `database`/`storage` gate the `ready` boolean and status code: both
 * are hard blockers for the web app itself. `worker` and `email` run in a
 * *separate* container (DEPLOYMENT.md §2) — surfaced here for the same
 * at-a-glance visibility the admin dashboard's health tiles give, but a
 * stalled worker or unconfigured SMTP delays background jobs, it doesn't
 * make the web tier unable to serve a request.
 */
export async function GET() {
  const [database, storage, worker, email] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkWorker(),
    checkEmail(),
  ]);
  const checks = { database, storage, worker, email };
  const ready = database.status !== "down" && storage.status !== "down";

  return NextResponse.json(
    { status: ready ? "ready" : "not_ready", checks },
    { status: ready ? 200 : 503 },
  );
}
