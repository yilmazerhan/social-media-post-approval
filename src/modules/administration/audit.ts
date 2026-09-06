/**
 * Read-only audit log viewer — API.md's `GET /admin/audit-logs`. No write
 * endpoint exists anywhere in this module or its routes: `AuditLog` is
 * append-only (CLAUDE.md, SECURITY.md — the DB role backing this table
 * holds only `INSERT, SELECT`), and Phase 23 owns filters/CSV export in
 * full; this is the plain list this phase's admin nav needs to link to.
 */
import type { AuditLog } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export interface ListAuditLogsFilters {
  action?: string;
  entityType?: string;
  actorId?: string;
  page: number;
  pageSize: number;
}

/** `AuditLog.id` is a Prisma `BigInt`, which `JSON.stringify` can't serialize — carried as a string instead. */
function serializeAuditLog(log: AuditLog) {
  return { ...log, id: log.id.toString() };
}

export async function listAuditLogs(filters: ListAuditLogsFilters) {
  const where = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
  };
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
