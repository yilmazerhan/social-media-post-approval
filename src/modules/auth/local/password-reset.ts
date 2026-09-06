/**
 * Password reset — AUTHENTICATION.md §2. The request side never reveals
 * whether an email exists; the caller (route handler) must return the
 * same response either way. Delivery goes through `EmailService`
 * (Phase 17's `sendTemplatedEmail`) exactly like every other templated
 * email in the system.
 */
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { writeAudit } from "@/modules/audit";
import { sendTemplatedEmail } from "@/modules/email";
import type { User } from "@/generated/prisma/client";
import { hashPassword } from "./password";
import { checkPasswordPolicy } from "./password-policy";
import { InvalidResetTokenError, PasswordPolicyError } from "./errors";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Always resolves — the route handler returns the same message regardless of the outcome here. */
export async function requestPasswordReset(
  email: string,
  requestIp?: string | null,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (
    !user ||
    user.authProvider !== "LOCAL" ||
    user.status !== "ACTIVE" ||
    user.deletedAt
  ) {
    return;
  }

  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + config.PASSWORD_RESET_TTL_MINUTES * 60_000,
  );

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt,
      requestedIp: requestIp ?? undefined,
    },
  });

  await sendTemplatedEmail({
    templateKey: "password_reset",
    to: user.email,
    variables: {
      appName: config.APP_NAME,
      resetUrl: `${config.APP_URL}/reset-password?token=${rawToken}`,
      ttlMinutes: config.PASSWORD_RESET_TTL_MINUTES,
    },
    userId: user.id,
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "AUTH_PASSWORD_RESET_REQUESTED",
    entityType: "User",
    entityId: user.id,
    ipAddress: requestIp,
  });
}

export async function completePasswordReset(
  rawToken: string,
  newPassword: string,
): Promise<User> {
  const tokenHash = hashToken(rawToken);
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!token || token.usedAt || token.expiresAt <= new Date()) {
    throw new InvalidResetTokenError();
  }

  const violations = checkPasswordPolicy(newPassword, {
    email: token.user.email,
    displayName: token.user.displayName,
  });
  if (violations.length > 0) {
    throw new PasswordPolicyError(violations);
  }

  const passwordHash = await hashPassword(newPassword);

  const [, updated] = await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: token.userId },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.session.updateMany({
      where: { userId: token.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "PASSWORD_CHANGED" },
    }),
  ]);

  await writeAudit({
    actorId: updated.id,
    actorEmail: updated.email,
    action: "AUTH_PASSWORD_RESET_COMPLETED",
    entityType: "User",
    entityId: updated.id,
  });

  return updated;
}
