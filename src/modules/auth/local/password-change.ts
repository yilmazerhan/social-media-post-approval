/** Authenticated password change — AUTHENTICATION.md §2. */
import { prisma } from "@/server/db";
import { writeAudit } from "@/modules/audit";
import type { User } from "@/generated/prisma/client";
import { hashPassword, verifyPassword } from "./password";
import { checkPasswordPolicy } from "./password-policy";
import { InvalidCredentialsError, PasswordPolicyError } from "./errors";

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  /** The session making this request — kept alive while every other session is revoked. */
  keepSessionId?: string;
}): Promise<User> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
  });

  if (user.authProvider !== "LOCAL" || !user.passwordHash) {
    throw new InvalidCredentialsError();
  }

  const currentOk = await verifyPassword(
    user.passwordHash,
    input.currentPassword,
  );
  if (!currentOk) {
    throw new InvalidCredentialsError();
  }

  const violations = checkPasswordPolicy(input.newPassword, {
    email: user.email,
    displayName: user.displayName,
  });
  if (violations.length > 0) {
    throw new PasswordPolicyError(violations);
  }

  const passwordHash = await hashPassword(input.newPassword);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordUpdatedAt: new Date(),
      mustChangePassword: false,
    },
  });

  await prisma.session.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
      ...(input.keepSessionId ? { id: { not: input.keepSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: "PASSWORD_CHANGED" },
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "AUTH_PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
  });

  return updated;
}
