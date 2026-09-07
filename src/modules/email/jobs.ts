/**
 * `EMAIL_SEND` job handler — the delivery half of `EmailService`
 * (ARCHITECTURE.md §8). Everything needed to send already lives in the
 * job's own payload (rendered at enqueue time), so this only ever
 * delivers and records the outcome on the matching `EmailLog` row —
 * never re-renders, never re-reads the template.
 */
import { prisma } from "@/server/db";
import { registerJobHandler } from "@/jobs/queue";
import { smtpEmailProvider } from "./provider";
import type { EmailSendJobPayload } from "./types";

function isEmailSendPayload(value: unknown): value is EmailSendJobPayload {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as EmailSendJobPayload).emailLogId === "string" &&
    typeof (value as EmailSendJobPayload).to === "string" &&
    typeof (value as EmailSendJobPayload).subject === "string"
  );
}

registerJobHandler("EMAIL_SEND", async (payload) => {
  if (!isEmailSendPayload(payload)) {
    throw new Error("EMAIL_SEND payload missing emailLogId/to/subject.");
  }
  const logId = BigInt(payload.emailLogId);

  try {
    await smtpEmailProvider.send({
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    await prisma.emailLog.update({
      where: { id: logId },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.emailLog.update({
      where: { id: logId },
      data: {
        status: "FAILED",
        lastError: message,
        attempts: { increment: 1 },
      },
    });
    // Re-throw so the queue's own backoff/retry (queue.ts) handles requeueing.
    throw err;
  }
});
