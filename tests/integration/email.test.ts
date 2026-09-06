import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { runClaimedJob } from "@/jobs/queue";
import { sendTemplatedEmail, sendTestEmail } from "@/modules/email";
// Side-effect import: registers the EMAIL_SEND handler this test exercises
// directly, mirroring how src/jobs/worker.ts wires it up.
import "@/modules/email/jobs";

/**
 * Phase 17 — email delivery. `.env`'s EMAIL_ENABLED=false in this test
 * environment, so `sendTemplatedEmail` always takes its SUPPRESSED path —
 * exactly the behavior a staging environment relies on ("logs instead of
 * sending"). The delivery/retry path is proven separately below by
 * building a job the same shape `sendTemplatedEmail` would build and
 * running it directly: SMTP_HOST/PORT (.env) has nothing listening in
 * this sandbox, so the send genuinely fails — a real, not simulated,
 * connection failure exercises "SMTP failure retries and records
 * lastError" for real.
 */

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function createUser(displayName: string) {
  const user = await prisma.user.create({
    data: {
      email: `email-${randomUUID()}@editortest.local`,
      displayName,
      firstName: displayName,
      lastName: "Test",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

describe("sendTemplatedEmail", () => {
  it("suppresses delivery when EMAIL_ENABLED is false, still logging the rendered subject", async () => {
    const user = await createUser("Email Suppressed User");
    await sendTemplatedEmail({
      templateKey: "post_approved",
      to: user.email,
      variables: {
        postTitle: "My Post",
        version: 1,
        approverName: "Jane",
        postUrl: "https://x",
      },
      userId: user.id,
    });

    const log = await prisma.emailLog.findFirstOrThrow({
      where: { toAddress: user.email, templateKey: "post_approved" },
    });
    expect(log.status).toBe("SUPPRESSED");
    expect(log.subject).toBe("Approved: My Post");
    expect(log.jobId).toBeNull();
  });

  it("is a no-op on a repeated call with the same idempotency key", async () => {
    const user = await createUser("Email Idempotent User");
    const idempotencyKey = `test-idem-${randomUUID()}`;
    await sendTemplatedEmail({
      templateKey: "post_rejected",
      to: user.email,
      variables: {
        postTitle: "P",
        approverName: "Jane",
        reason: "No.",
        postUrl: "https://x",
      },
      userId: user.id,
      idempotencyKey,
    });
    await sendTemplatedEmail({
      templateKey: "post_rejected",
      to: user.email,
      variables: {
        postTitle: "P",
        approverName: "Jane",
        reason: "No.",
        postUrl: "https://x",
      },
      userId: user.id,
      idempotencyKey,
    });

    const logs = await prisma.emailLog.findMany({ where: { idempotencyKey } });
    expect(logs).toHaveLength(1);
  });

  it("logs nothing and skips delivery for a template that doesn't exist", async () => {
    const user = await createUser("Email Missing Template User");
    const templateKey = `does-not-exist-${randomUUID()}`;
    await sendTemplatedEmail({
      templateKey,
      to: user.email,
      variables: {},
      userId: user.id,
    });

    const log = await prisma.emailLog.findFirst({ where: { templateKey } });
    expect(log).toBeNull();
  });
});

describe("sendTestEmail", () => {
  it("logs a suppressed test send when EMAIL_ENABLED is false", async () => {
    const to = `admin-test-${randomUUID()}@editortest.local`;
    await sendTestEmail(to);

    const log = await prisma.emailLog.findFirstOrThrow({
      where: { toAddress: to, templateKey: "test_send" },
    });
    expect(log.status).toBe("SUPPRESSED");
  });
});

describe("EMAIL_SEND job handler", () => {
  it("marks the EmailLog FAILED and records lastError on a real SMTP connection failure, leaving the job retryable", async () => {
    const log = await prisma.emailLog.create({
      data: {
        templateKey: "post_approved",
        toAddress: "nobody@editortest.local",
        subject: "Test delivery failure",
        status: "QUEUED",
      },
    });
    const job = await prisma.backgroundJob.create({
      data: {
        type: "EMAIL_SEND",
        payload: {
          emailLogId: log.id.toString(),
          to: "nobody@editortest.local",
          subject: "Test delivery failure",
          html: "<p>Body.</p>",
        },
      },
    });

    // runClaimedJob catches the handler's error itself and records the
    // outcome on the job row — it never rejects to its own caller.
    await runClaimedJob(job);

    const updatedLog = await prisma.emailLog.findUniqueOrThrow({
      where: { id: log.id },
    });
    expect(updatedLog.status).toBe("FAILED");
    expect(updatedLog.lastError).toBeTruthy();

    const updatedJob = await prisma.backgroundJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updatedJob.status).toBe("PENDING");
    expect(updatedJob.lastError).toBeTruthy();
    expect(updatedJob.scheduledAt.getTime()).toBeGreaterThan(Date.now());
  });
});
