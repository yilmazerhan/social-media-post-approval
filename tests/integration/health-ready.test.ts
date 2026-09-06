import { mkdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { config } from "@/server/config";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getReady } from "@/app/api/ready/route";

/**
 * DEPLOYMENT.md §3/§8/§12 — the container `HEALTHCHECK` target and the
 * post-deploy readiness gate. Both are unauthenticated by design (an
 * orchestrator has no session cookie), so there's no protected-handler
 * wrapper to exercise here — just the response shape and status code.
 */
describe("GET /api/health", () => {
  it("always reports ok without touching any dependency", async () => {
    const response = getHealth();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

describe("GET /api/ready", () => {
  it("reports ready when the database and storage are both reachable, and surfaces worker/email alongside", async () => {
    await mkdir(config.STORAGE_PATH, { recursive: true });
    const response = await getReady();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe("ready");
    expect(body.checks.database.status).toBe("healthy");
    expect(body.checks.storage.status).not.toBe("down");
    // Present for the ARCHITECTURE.md §9 checklist, but never gate
    // `ready` — see the route's own comment.
    expect(body.checks.worker).toBeDefined();
    expect(body.checks.email).toBeDefined();
  });

  it("reports not_ready with 503 when storage is unreachable", async () => {
    const original = config.STORAGE_PATH;
    config.STORAGE_PATH = "/nonexistent/path/does-not-exist";
    try {
      const response = await getReady();
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body.status).toBe("not_ready");
      expect(body.checks.storage.status).toBe("down");
    } finally {
      config.STORAGE_PATH = original;
    }
  });

  it("stays ready even when the worker heartbeat is missing", async () => {
    const { prisma } = await import("@/server/db");
    const original = await prisma.systemSetting.findUnique({
      where: { key: "system.worker.lastHeartbeatAt" },
    });
    await prisma.systemSetting.update({
      where: { key: "system.worker.lastHeartbeatAt" },
      data: { value: null },
    });
    try {
      const response = await getReady();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.status).toBe("ready");
      expect(body.checks.worker.status).toBe("down");
    } finally {
      await prisma.systemSetting.update({
        where: { key: "system.worker.lastHeartbeatAt" },
        data: { value: original?.value ?? null },
      });
    }
  });
});
