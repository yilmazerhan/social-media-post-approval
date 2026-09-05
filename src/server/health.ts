/**
 * Best-effort liveness checks backing the admin dashboard's health tiles
 * (UI_UX_SPEC.md §6). This is diagnostic surface, not the production
 * container health-check endpoint — that's Phase 27's `/api/health` and
 * `/api/ready` (ARCHITECTURE.md's directory layout, DEPLOYMENT.md).
 *
 * Each tile fails independently: one dependency being down never prevents
 * the other three from reporting.
 */
import { access, constants as fsConstants } from "node:fs/promises";
import { config } from "@/server/config";
import { prisma } from "@/server/db";

export type HealthStatus = "healthy" | "degraded" | "down";

export interface HealthTile {
  key: "database" | "storage" | "worker" | "email";
  label: string;
  status: HealthStatus;
  detail: string;
}

const WORKER_FAILURE_WINDOW_HOURS = 24;
const EMAIL_FAILURE_WINDOW_HOURS = 24;

async function checkDatabase(): Promise<HealthTile> {
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

async function checkStorage(): Promise<HealthTile> {
  try {
    await access(config.STORAGE_PATH, fsConstants.W_OK);
    return {
      key: "storage",
      label: "Storage",
      status: "healthy",
      detail: "Upload directory is writable.",
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

async function checkWorker(): Promise<HealthTile> {
  try {
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

async function checkEmail(): Promise<HealthTile> {
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
  ]);
}
