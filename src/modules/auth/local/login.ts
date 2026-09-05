/**
 * Local login — AUTHENTICATION.md §2. Rate limiting and lockout are
 * durable (PostgreSQL), so they survive a process restart and are shared
 * across replicas.
 */
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { writeAudit } from "@/modules/audit";
import type { User } from "@/generated/prisma/client";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import {
  AccountLockedError,
  InvalidCredentialsError,
  ProviderMismatchError,
  RateLimitedError,
} from "./errors";

export interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** A fixed-parameter hash verified against on an unknown email so response
 * timing doesn't reveal account existence. Computed once per process. */
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("timing-safety-placeholder-password");
  }
  return dummyHashPromise;
}

async function recordAttempt(input: {
  email: string;
  userId?: string | null;
  successful: boolean;
  reason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await prisma.loginAttempt.create({
    data: {
      email: input.email,
      userId: input.userId ?? undefined,
      successful: input.successful,
      reason: input.reason,
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ? input.userAgent.slice(0, 512) : undefined,
    },
  });
}

async function isRateLimited(
  email: string,
  ipAddress?: string | null,
): Promise<boolean> {
  const windowStart = new Date(
    Date.now() - config.RATE_LIMIT_AUTH_WINDOW_MINUTES * 60_000,
  );
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({
      where: { email, createdAt: { gte: windowStart } },
    }),
    ipAddress
      ? prisma.loginAttempt.count({
          where: { ipAddress, createdAt: { gte: windowStart } },
        })
      : Promise.resolve(0),
  ]);
  return (
    byEmail >= config.RATE_LIMIT_AUTH_MAX || byIp >= config.RATE_LIMIT_AUTH_MAX
  );
}

export async function loginLocal(input: LoginInput): Promise<User> {
  const email = input.email.trim().toLowerCase();

  if (await isRateLimited(email, input.ipAddress)) {
    throw new RateLimitedError();
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await verifyPassword(await getDummyHash(), input.password);
    await recordAttempt({
      email,
      successful: false,
      reason: "UNKNOWN_EMAIL",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw new InvalidCredentialsError();
  }

  if (user.authProvider !== "LOCAL") {
    await recordAttempt({
      email,
      userId: user.id,
      successful: false,
      reason: "PROVIDER_MISMATCH",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw new ProviderMismatchError();
  }

  if (
    user.status === "DISABLED" ||
    user.status === "LOCKED" ||
    user.deletedAt ||
    !user.passwordHash
  ) {
    await recordAttempt({
      email,
      userId: user.id,
      successful: false,
      reason: "ACCOUNT_INACTIVE",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw new InvalidCredentialsError();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAttempt({
      email,
      userId: user.id,
      successful: false,
      reason: "LOCKED_OUT",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw new AccountLockedError(user.lockedUntil);
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);

  if (!passwordOk) {
    const failedLoginCount = user.failedLoginCount + 1;
    const justLocked = failedLoginCount >= config.LOCKOUT_THRESHOLD;
    const lockedUntil = justLocked
      ? new Date(Date.now() + config.LOCKOUT_DURATION_MINUTES * 60_000)
      : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: justLocked ? 0 : failedLoginCount,
        lockedUntil,
      },
    });
    await recordAttempt({
      email,
      userId: user.id,
      successful: false,
      reason: "BAD_PASSWORD",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    await writeAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: justLocked ? "AUTH_LOCKED_OUT" : "AUTH_LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    if (justLocked && lockedUntil) {
      throw new AccountLockedError(lockedUntil);
    }
    throw new InvalidCredentialsError();
  }

  const updateData: {
    failedLoginCount: number;
    lockedUntil: null;
    lastLoginAt: Date;
    passwordHash?: string;
  } = {
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
  };
  if (needsRehash(user.passwordHash)) {
    updateData.passwordHash = await hashPassword(input.password);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  await recordAttempt({
    email,
    userId: user.id,
    successful: true,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "AUTH_LOGIN_SUCCESS",
    entityType: "User",
    entityId: user.id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return updated;
}
