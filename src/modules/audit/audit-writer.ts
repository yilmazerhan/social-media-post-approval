/**
 * Append-only audit writes — DATABASE.md §7, SECURITY.md. The reporting
 * and admin-viewer side (filters, CSV export) lands in Phase 23; every
 * module that produces a security- or business-relevant event writes
 * through this one function starting now, so nothing needs retrofitting
 * later. Never pass a password, cookie, token or SAML assertion in
 * `metadata` — see SECURITY.md §7.
 */
import { prisma } from "@/server/db";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export interface AuditEventInput {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  postId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(
  input: AuditEventInput,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: input.actorId ?? undefined,
      actorEmail: input.actorEmail ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      postId: input.postId ?? undefined,
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
