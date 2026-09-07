/**
 * Email template administration and connection status — API.md's
 * `/api/v1/admin/email/*`. SMTP host/port/credentials stay env-only
 * (CONFIGURATION.md, SECURITY.md's credential-handling stance) — there is
 * no `PATCH /email/settings` here to edit them; this only ever reports
 * the currently effective, non-secret values, and edits the 8 seeded
 * `EmailTemplate` rows.
 */
import type { EmailLog } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import { renderTemplate } from "@/modules/email";
import type { EmailTemplateInput } from "./validation";

/** `EmailLog.id`/`jobId` are Prisma `BigInt`s, which `JSON.stringify` can't serialize — carried as strings instead. */
function serializeEmailLog(log: EmailLog) {
  return {
    ...log,
    id: log.id.toString(),
    jobId: log.jobId === null ? null : log.jobId.toString(),
  };
}

export interface EmailSettingsDto {
  enabled: boolean;
  host: string;
  port: number;
  tls: string;
  fromAddress: string;
  replyTo: string | null;
  maxAttempts: number;
}

export function getEmailSettings(): EmailSettingsDto {
  return {
    enabled: config.EMAIL_ENABLED,
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    tls: config.SMTP_TLS,
    fromAddress: config.SMTP_FROM,
    replyTo: config.SMTP_REPLY_TO ?? null,
    maxAttempts: config.EMAIL_MAX_ATTEMPTS,
  };
}

export async function listEmailTemplates() {
  return prisma.emailTemplate.findMany({ orderBy: { name: "asc" } });
}

export async function updateEmailTemplate(
  key: string,
  input: EmailTemplateInput,
  actorId: string,
) {
  const existing = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!existing) throw new NotFoundError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.emailTemplate.update({
      where: { key },
      data: { ...input, updatedById: actorId },
    });
    await writeAudit(
      {
        actorId,
        action: "EMAIL_TEMPLATE_UPDATED",
        entityType: "EmailTemplate",
        entityId: key,
      },
      tx,
    );
    return updated;
  });
}

export interface EmailTemplatePreviewDto {
  subject: string;
  body: string;
}

/** `POST /email/templates/:key/preview` (API.md) — renders with caller-supplied sample values, same `renderTemplate` a real send uses. */
export async function previewEmailTemplate(
  key: string,
  variables: Record<string, string | number>,
): Promise<EmailTemplatePreviewDto> {
  const template = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!template) throw new NotFoundError();
  return renderTemplate(template, variables);
}

export async function listEmailLogs(page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.emailLog.findMany({
      orderBy: { queuedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.emailLog.count(),
  ]);
  return { items: items.map(serializeEmailLog), total };
}
