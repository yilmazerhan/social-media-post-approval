/**
 * Best-effort liveness checks backing the admin dashboard's health tiles
 * (UI_UX_SPEC.md §6) — the same probes `/api/ready`
 * (`src/app/api/ready/route.ts`) reuses for ARCHITECTURE.md §9's
 * "database, storage writability, worker heartbeat, SMTP configuration
 * presence" readiness check, rather than duplicating them.
 *
 * Each tile fails independently: one dependency being down never prevents
 * the others from reporting.
 */
import { access, constants as fsConstants, statfs } from "node:fs/promises";
import { config } from "@/server/config";
import { prisma } from "@/server/db";

export type HealthStatus = "healthy" | "degraded" | "down";

export interface HealthTile {
  key: "database" | "storage" | "worker" | "email" | "backup";
  label: string;
  status: HealthStatus;
  detail: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(1)} ${units[unit]}`;
}

const WORKER_FAILURE_WINDOW_HOURS = 24;
const EMAIL_FAILURE_WINDOW_HOURS = 24;

export async function checkDatabase(): Promise<HealthTile> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      key: "database",
      label: "Database",
      status: "healthy",
      detail: "Connected.",
    };
  } catch {
    return {
      key: "database",
      label: "Database",
      status: "down",
      detail: "Database is not responding.",
    };
  }
}

export async function checkStorage(): Promise<HealthTile> {
  try {
    await access(config.STORAGE_PATH, fsConstants.W_OK);
    const stats = await statfs(config.STORAGE_PATH);
    const totalBytes = stats.bsize * stats.blocks;
    const freeBytes = stats.bsize * stats.bavail;
    const usedBytes = totalBytes - freeBytes;
    const usedPercent =
      totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
    return {
      key: "storage",
      label: "Storage",
      status: usedPercent >= 90 ? "degraded" : "healthy",
      detail: `${formatBytes(usedBytes)} used of ${formatBytes(totalBytes)} (${usedPercent}%).`,
    };
  } catch {
    return {
      key: "storage",
      label: "Storage",
      status: "down",
      detail: "Upload directory is missing or not writable.",
    };
  }
}

/** BACKUP_RESTORE.md §7 — `scripts/backup.sh` writes this marker through the existing `PATCH /admin/settings/:key` endpoint after each successful run. */
async function checkBackup(): Promise<HealthTile> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "system.backup.lastRunAt" },
    });
    if (!setting?.value) {
      return {
        key: "backup",
        label: "Backup",
        status: "degraded",
        detail: "No backup has been recorded yet.",
      };
    }
    const lastRunAt = new Date(setting.value);
    const hoursSince = (Date.now() - lastRunAt.getTime()) / (60 * 60 * 1000);
    if (hoursSince > config.BACKUP_STALENESS_HOURS) {
      return {
        key: "backup",
        label: "Backup",
        status: "degraded",
        detail: `Last backup was ${Math.round(hoursSince)}h ago (expected within ${config.BACKUP_STALENESS_HOURS}h).`,
      };
    }
    return {
      key: "backup",
      label: "Backup",
      status: "healthy",
      detail: `Last backup completed ${lastRunAt.toISOString()}.`,
    };
  } catch {
    return {
      key: "backup",
      label: "Backup",
      status: "down",
      detail: "Could not read the backup marker.",
    };
  }
}

/**
 * ARCHITECTURE.md §9's "worker heartbeat" — an empty, error-free queue
 * looks identical to "healthy" whether or not the worker process is
 * actually running at all, so a fresh `system.worker.lastHeartbeatAt`
 * (written every poll tick — src/jobs/queue.ts's `recordHeartbeat`) is the
 * one signal that actually distinguishes "idle" from "not running."
 */
async function checkWorkerHeartbeat(): Promise<HealthTile> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "system.worker.lastHeartbeatAt" },
    });
    if (!setting?.value) {
      return {
        key: "worker",
        label: "Worker",
        status: "down",
        detail: "No worker heartbeat recorded yet.",
      };
    }
    const lastHeartbeatAt = new Date(setting.value);
    const secondsSince = (Date.now() - lastHeartbeatAt.getTime()) / 1000;
    if (secondsSince > config.WORKER_HEARTBEAT_STALE_SECONDS) {
      return {
        key: "worker",
        label: "Worker",
        status: "down",
        detail: `Last heartbeat ${Math.round(secondsSince)}s ago (expected within ${config.WORKER_HEARTBEAT_STALE_SECONDS}s).`,
      };
    }
    return {
      key: "worker",
      label: "Worker",
      status: "healthy",
      detail: `Last heartbeat ${lastHeartbeatAt.toISOString()}.`,
    };
  } catch {
    return {
      key: "worker",
      label: "Worker",
      status: "down",
      detail: "Could not read the worker heartbeat.",
    };
  }
}

export async function checkWorker(): Promise<HealthTile> {
  try {
    const heartbeat = await checkWorkerHeartbeat();
    if (heartbeat.status === "down") return heartbeat;

    const since = new Date(
      Date.now() - WORKER_FAILURE_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const [deadCount, pendingCount] = await Promise.all([
      prisma.backgroundJob.count({
        where: { status: "DEAD", updatedAt: { gte: since } },
      }),
      prisma.backgroundJob.count({ where: { status: "PENDING" } }),
    ]);
    if (deadCount > 0) {
      return {
        key: "worker",
        label: "Worker",
        status: "degraded",
        detail: `${deadCount} job(s) failed permanently in the last 24h.`,
      };
    }
    return {
      key: "worker",
      label: "Worker",
      status: "healthy",
      detail:
        pendingCount > 0
          ? `${pendingCount} job(s) queued.`
          : "No background jobs queued.",
    };
  } catch {
    return {
      key: "worker",
      label: "Worker",
      status: "down",
      detail: "Could not read the job queue.",
    };
  }
}

/**
 * ARCHITECTURE.md §9's "SMTP configuration presence" — `SMTP_HOST`/
 * `SMTP_FROM` are non-optional in `server/config.ts`'s schema, so this can
 * only actually fail if `EMAIL_ENABLED` is on with a value the schema
 * would already have rejected at boot; it's here as the same observable
 * signal ARCHITECTURE.md asks `/api/ready` to expose, not a live SMTP
 * connectivity probe (too slow and too network-flaky for a readiness gate).
 */
function checkSmtpConfigPresence(): HealthTile | null {
  if (!config.EMAIL_ENABLED) return null;
  if (!config.SMTP_HOST || !config.SMTP_FROM) {
    return {
      key: "email",
      label: "Email",
      status: "down",
      detail: "SMTP is enabled but not configured.",
    };
  }
  return null;
}

export async function checkEmail(): Promise<HealthTile> {
  const configIssue = checkSmtpConfigPresence();
  if (configIssue) return configIssue;

  try {
    const since = new Date(
      Date.now() - EMAIL_FAILURE_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const failedCount = await prisma.emailLog.count({
      where: { status: "FAILED", queuedAt: { gte: since } },
    });
    if (failedCount > 0) {
      return {
        key: "email",
        label: "Email",
        status: "degraded",
        detail: `${failedCount} email(s) failed to send in the last 24h.`,
      };
    }
    return {
      key: "email",
      label: "Email",
      status: "healthy",
      detail: "No delivery failures in the last 24h.",
    };
  } catch {
    return {
      key: "email",
      label: "Email",
      status: "down",
      detail: "Could not read the email log.",
    };
  }
}

export async function getSystemHealth(): Promise<HealthTile[]> {
  return Promise.all([
    checkDatabase(),
    checkStorage(),
    checkWorker(),
    checkEmail(),
    checkBackup(),
  ]);
}
