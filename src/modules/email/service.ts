/**
 * `EmailService` — ARCHITECTURE.md §8: renders a template + payload into a
 * queued `EMAIL_SEND` job and an `EmailLog` row. The one place any module
 * queues an email, the same "one place" pattern `writeAudit`/
 * `writeNotification` already establish for their own tables.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { workerLogger as logger } from "@/server/logger";
import { renderTemplate } from "./render";
import type { EmailSendJobPayload, SendTemplatedEmailInput } from "./types";

export async function sendTemplatedEmail(
  input: SendTemplatedEmailInput,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  if (input.idempotencyKey) {
    const existing = await client.emailLog.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return;
  }

  const template = await client.emailTemplate.findUnique({
    where: { key: input.templateKey },
  });
  if (!template || !template.isActive) {
    // A missing/inactive template is a configuration problem, not a
    // per-recipient decision — there's no EmailLog row to attribute it to.
    logger.error(
      { templateKey: input.templateKey },
      "Email template missing or inactive; email not sent.",
    );
    return;
  }

  const rendered = renderTemplate(template, input.variables);

  if (!config.EMAIL_ENABLED) {
    await client.emailLog.create({
      data: {
        templateKey: input.templateKey,
        toAddress: input.to,
        ccAddress: input.cc,
        subject: rendered.subject,
        status: "SUPPRESSED",
        postId: input.postId ?? undefined,
        userId: input.userId ?? undefined,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return;
  }

  const log = await client.emailLog.create({
    data: {
      templateKey: input.templateKey,
      toAddress: input.to,
      ccAddress: input.cc,
      subject: rendered.subject,
      status: "QUEUED",
      postId: input.postId ?? undefined,
      userId: input.userId ?? undefined,
      idempotencyKey: input.idempotencyKey,
    },
  });

  const payload: EmailSendJobPayload = {
    emailLogId: log.id.toString(),
    to: input.to,
    cc: input.cc,
    subject: rendered.subject,
    html: template.isHtml ? rendered.body : undefined,
    text: template.isHtml ? undefined : rendered.body,
  };
  const job = await client.backgroundJob.create({
    data: {
      type: "EMAIL_SEND",
      payload: payload as unknown as Prisma.InputJsonValue,
      maxAttempts: config.EMAIL_MAX_ATTEMPTS,
    },
  });

  await client.emailLog.update({
    where: { id: log.id },
    data: { jobId: job.id },
  });
}

/** Admin "test this connection" (API.md's `POST /admin/email/test`) — not tied to any stored template, so it skips the lookup and idempotency machinery entirely and goes straight through the same job/log pipeline. */
export async function sendTestEmail(to: string): Promise<void> {
  const subject = `${config.APP_NAME} test email`;
  const body = `<p>This is a test email from ${config.APP_NAME}, sent at ${new Date().toISOString()}.</p><p>If you received this, outbound SMTP delivery is working.</p>`;

  const log = await prisma.emailLog.create({
    data: {
      templateKey: "test_send",
      toAddress: to,
      subject,
      status: config.EMAIL_ENABLED ? "QUEUED" : "SUPPRESSED",
    },
  });

  if (!config.EMAIL_ENABLED) return;

  const payload: EmailSendJobPayload = {
    emailLogId: log.id.toString(),
    to,
    subject,
    html: body,
  };
  const job = await prisma.backgroundJob.create({
    data: {
      type: "EMAIL_SEND",
      payload: payload as unknown as Prisma.InputJsonValue,
      maxAttempts: config.EMAIL_MAX_ATTEMPTS,
    },
  });
  await prisma.emailLog.update({
    where: { id: log.id },
    data: { jobId: job.id },
  });
}
