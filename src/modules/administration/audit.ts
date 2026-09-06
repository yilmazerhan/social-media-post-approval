/**
 * Read-only audit log viewer — API.md's `GET /admin/audit-logs` (filters +
 * CSV export). No write endpoint exists anywhere in this module or its
 * routes: `AuditLog` is append-only (CLAUDE.md, SECURITY.md — the DB role
 * backing this table holds only `INSERT, SELECT`).
 */
import type { AuditLog } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  postId?: string;
  from?: Date;
  to?: Date;
}

/** Bounds a CSV export to something a browser and a spreadsheet can actually open — an unbounded export of a table this codebase expects to grow indefinitely (RETENTION_AUDIT_LOG_DAYS defaults to 730) would size a single request unpredictably. Narrow the filters (a date range, an action) to get everything within that window. */
const MAX_EXPORT_ROWS = 10_000;

function auditLogWhere(filters: AuditLogFilters) {
  return {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.postId ? { postId: filters.postId } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { gte: filters.from, lte: filters.to } }
      : {}),
  };
}

/** `AuditLog.id` is a Prisma `BigInt`, which `JSON.stringify` can't serialize — carried as a string instead. */
function serializeAuditLog(log: AuditLog) {
  return { ...log, id: log.id.toString() };
}

export async function listAuditLogs(
  filters: AuditLogFilters & { page: number; pageSize: number },
) {
  const where = auditLogWhere(filters);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items: items.map(serializeAuditLog), total };
}

/** The most recent `MAX_EXPORT_ROWS` rows matching `filters`, for CSV export — not paginated, since a spreadsheet is the pagination. */
export async function listAuditLogsForExport(filters: AuditLogFilters) {
  const items = await prisma.auditLog.findMany({
    where: auditLogWhere(filters),
    orderBy: { createdAt: "desc" },
    take: MAX_EXPORT_ROWS,
  });
  return items.map(serializeAuditLog);
}
