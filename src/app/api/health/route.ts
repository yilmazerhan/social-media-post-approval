import { NextResponse } from "next/server";

/**
 * Liveness only — DEPLOYMENT.md §3/§8, the Docker `HEALTHCHECK` target.
 * Deliberately checks nothing downstream: a database blip must not make an
 * orchestrator kill and restart an app process that would otherwise recover
 * on its own. That's what `/api/ready` is for.
 */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
