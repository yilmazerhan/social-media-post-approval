import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import {
  AccountLockedError,
  InvalidCredentialsError,
  InvalidResetTokenError,
  PasswordPolicyError,
  ProviderMismatchError,
  changePassword,
  completePasswordReset,
  hashPassword,
  loginLocal,
  requestPasswordReset,
} from "@/modules/auth/local";
import { createSession, validateSession } from "@/modules/auth/session";
// Internal helpers, not the module's public surface — needed here to
// construct session rows with arbitrary lastSeenAt/expiresAt timestamps,
// which createSession() (correctly) always sets to "now". See
// tests/integration/saml-acs.test.ts for the same reach-in pattern.
import {
  encodeCookieValue,
  generateSessionSecret,
  hashSecret,
} from "@/modules/auth/session/cookie";

/**
 * Exercises AUTHENTICATION.md §2 (local login, lockout, reset, change) and
 * §4 (session death on disable) end to end against the real Postgres test
 * database. loginLocal() rate-limits by email AND by ip — every call here
 * omits ipAddress so unrelated tests (and their unique emails) never share
 * a counter.
 */

const VALID_PASSWORD = "Correct-Horse-9";
const ANOTHER_VALID_PASSWORD = "Battery-Staple-4";

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function extractResetToken(resetUrl: string): string {
  const token = new URL(resetUrl).searchParams.get("token");
  if (!token) throw new Error("resetUrl carried no token");
  return token;
}

const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];
const createdResetTokenIds: string[] = [];
const createdJobIds: bigint[] = [];

afterAll(async () => {
  if (createdSessionIds.length) {
    await prisma.session.deleteMany({
      where: { id: { in: createdSessionIds } },
    });
  }
  if (createdResetTokenIds.length) {
    await prisma.passwordResetToken.deleteMany({
      where: { id: { in: createdResetTokenIds } },
    });
  }
  if (createdJobIds.length) {
    await prisma.backgroundJob.deleteMany({
      where: { id: { in: createdJobIds } },
    });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function makeLocalUser(
  overrides: Partial<Parameters<typeof prisma.user.create>[0]["data"]> = {},
) {
  const suffix = randomUUID();
  const passwordHash = await hashPassword(VALID_PASSWORD);
  const user = await prisma.user.create({
    data: {
      email: `local-${suffix}@authtest.local`,
      displayName: "Local Test User",
      firstName: "Local",
      lastName: "User",
      authProvider: "LOCAL",
      passwordHash,
      status: "ACTIVE",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

describe("loginLocal", () => {
  it("succeeds with the right password, resets counters, records the attempt", async () => {
    const user = await makeLocalUser();

    const result = await loginLocal({
      email: user.email,
      password: VALID_PASSWORD,
    });

    expect(result.id).toBe(user.id);
    expect(result.failedLoginCount).toBe(0);
    expect(result.lastLoginAt).not.toBeNull();

    const attempt = await prisma.loginAttempt.findFirst({
      where: { email: user.email, successful: true },
    });
    expect(attempt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "AUTH_LOGIN_SUCCESS", entityId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects the wrong password without revealing which field was wrong", async () => {
    const user = await makeLocalUser();

    await expect(
      loginLocal({ email: user.email, password: "wrong-password-entirely" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updated.failedLoginCount).toBe(1);
  });

  it("rejects an unknown email in constant shape and records it without a userId", async () => {
    const email = `no-such-user-${randomUUID()}@authtest.local`;

    await expect(
      loginLocal({ email, password: "whatever-12345" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    const attempt = await prisma.loginAttempt.findFirst({
      where: { email, reason: "UNKNOWN_EMAIL" },
    });
    expect(attempt).not.toBeNull();
    expect(attempt?.userId).toBeNull();
  });

  it("rejects an ENTRA_ID account attempting local login", async () => {
    const user = await makeLocalUser({
      authProvider: "ENTRA_ID",
      externalIdentityId: randomUUID(),
      passwordHash: null,
    });

    await expect(
      loginLocal({ email: user.email, password: "whatever-12345" }),
    ).rejects.toBeInstanceOf(ProviderMismatchError);
  });

  it("rejects a disabled account without distinguishing it from a bad password", async () => {
    const user = await makeLocalUser({ status: "DISABLED" });

    await expect(
      loginLocal({ email: user.email, password: VALID_PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("locks the account after LOCKOUT_THRESHOLD failed attempts, then holds the lock", async () => {
    const user = await makeLocalUser();

    for (let i = 1; i < config.LOCKOUT_THRESHOLD; i++) {
      await expect(
        loginLocal({ email: user.email, password: "wrong-password" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await expect(
      loginLocal({ email: user.email, password: "wrong-password" }),
    ).rejects.toBeInstanceOf(AccountLockedError);

    const locked = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(locked.failedLoginCount).toBe(0);
    expect(locked.lockedUntil).not.toBeNull();
    expect(locked.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

    // The correct password does not bypass an active lock.
    await expect(
      loginLocal({ email: user.email, password: VALID_PASSWORD }),
    ).rejects.toBeInstanceOf(AccountLockedError);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "AUTH_LOCKED_OUT", entityId: user.id },
    });
    expect(audit).not.toBeNull();
  });
});

describe("password reset", () => {
  it("does nothing observable for an email that doesn't exist", async () => {
    const email = `ghost-${randomUUID()}@authtest.local`;
    await expect(requestPasswordReset(email)).resolves.toBeUndefined();

    const token = await prisma.passwordResetToken.findFirst({
      where: { user: { email } },
    });
    expect(token).toBeNull();
  });

  it("runs the full request → reset → login-with-new-password flow", async () => {
    const user = await makeLocalUser();
    const oldSession = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(generateSessionSecret()),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() + 60 * 60_000),
        lastSeenAt: new Date(),
      },
    });
    createdSessionIds.push(oldSession.id);

    await requestPasswordReset(user.email);

    const tokenRow = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    createdResetTokenIds.push(tokenRow.id);

    const job = await prisma.backgroundJob.findFirstOrThrow({
      where: { type: "EMAIL_SEND" },
      orderBy: { createdAt: "desc" },
    });
    createdJobIds.push(job.id);
    const payload = job.payload as {
      to: string;
      variables: { resetUrl: string };
    };
    expect(payload.to).toBe(user.email);

    const rawToken = extractResetToken(payload.variables.resetUrl);
    expect(hashResetToken(rawToken)).toBe(tokenRow.tokenHash);

    // A policy-violating password leaves the token unused.
    await expect(
      completePasswordReset(rawToken, "short"),
    ).rejects.toBeInstanceOf(PasswordPolicyError);
    const stillUnused = await prisma.passwordResetToken.findUniqueOrThrow({
      where: { id: tokenRow.id },
    });
    expect(stillUnused.usedAt).toBeNull();

    const updated = await completePasswordReset(
      rawToken,
      ANOTHER_VALID_PASSWORD,
    );
    expect(updated.id).toBe(user.id);

    // Old password no longer works; the new one does.
    await expect(
      loginLocal({ email: user.email, password: VALID_PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      loginLocal({ email: user.email, password: ANOTHER_VALID_PASSWORD }),
    ).resolves.toMatchObject({ id: user.id });

    const revokedSession = await prisma.session.findUniqueOrThrow({
      where: { id: oldSession.id },
    });
    expect(revokedSession.revokedAt).not.toBeNull();
    expect(revokedSession.revokedReason).toBe("PASSWORD_CHANGED");

    // The token is single-use.
    await expect(
      completePasswordReset(rawToken, ANOTHER_VALID_PASSWORD),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it("rejects a garbage token", async () => {
    await expect(
      completePasswordReset("not-a-real-token", VALID_PASSWORD),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it("rejects an expired token", async () => {
    const user = await makeLocalUser();
    const rawToken = randomUUID();
    const tokenRow = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    createdResetTokenIds.push(tokenRow.id);

    await expect(
      completePasswordReset(rawToken, ANOTHER_VALID_PASSWORD),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });
});

describe("changePassword", () => {
  it("rejects the wrong current password", async () => {
    const user = await makeLocalUser();

    await expect(
      changePassword({
        userId: user.id,
        currentPassword: "not-the-current-password",
        newPassword: ANOTHER_VALID_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects a new password that fails policy", async () => {
    const user = await makeLocalUser();

    await expect(
      changePassword({
        userId: user.id,
        currentPassword: VALID_PASSWORD,
        newPassword: "short",
      }),
    ).rejects.toBeInstanceOf(PasswordPolicyError);
  });

  it("rejects a change on a non-LOCAL account", async () => {
    const user = await makeLocalUser({
      authProvider: "ENTRA_ID",
      externalIdentityId: randomUUID(),
      passwordHash: null,
    });

    await expect(
      changePassword({
        userId: user.id,
        currentPassword: "anything",
        newPassword: ANOTHER_VALID_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("changes the password and revokes every other session, keeping the current one", async () => {
    const user = await makeLocalUser();
    const keptSession = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(generateSessionSecret()),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() + 60 * 60_000),
        lastSeenAt: new Date(),
      },
    });
    const otherSession = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(generateSessionSecret()),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() + 60 * 60_000),
        lastSeenAt: new Date(),
      },
    });
    createdSessionIds.push(keptSession.id, otherSession.id);

    await changePassword({
      userId: user.id,
      currentPassword: VALID_PASSWORD,
      newPassword: ANOTHER_VALID_PASSWORD,
      keepSessionId: keptSession.id,
    });

    const [kept, revoked] = await Promise.all([
      prisma.session.findUniqueOrThrow({ where: { id: keptSession.id } }),
      prisma.session.findUniqueOrThrow({ where: { id: otherSession.id } }),
    ]);
    expect(kept.revokedAt).toBeNull();
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedReason).toBe("PASSWORD_CHANGED");

    await expect(
      loginLocal({ email: user.email, password: ANOTHER_VALID_PASSWORD }),
    ).resolves.toMatchObject({ id: user.id });
  });
});

describe("session death on account disablement (Phase 4 exit criterion)", () => {
  it("a disabled user's live session dies on the very next validateSession() call", async () => {
    const user = await makeLocalUser();
    const { session, cookieValue } = await createSession({
      userId: user.id,
      authProvider: "LOCAL",
    });
    createdSessionIds.push(session.id);

    const before = await validateSession(cookieValue);
    expect(before?.user.id).toBe(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { status: "DISABLED" },
    });

    const after = await validateSession(cookieValue);
    expect(after).toBeNull();

    const revoked = await prisma.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedReason).toBe("USER_DISABLED");
  });

  it("rejects an expired session and revokes it", async () => {
    const user = await makeLocalUser();
    const secret = generateSessionSecret();
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(secret),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() - 60_000),
        lastSeenAt: new Date(),
      },
    });
    createdSessionIds.push(session.id);

    const result = await validateSession(encodeCookieValue(session.id, secret));
    expect(result).toBeNull();

    const revoked = await prisma.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedReason).toBe("EXPIRED");
  });

  it("rejects a session that has been idle past SESSION_IDLE_TIMEOUT_MINUTES", async () => {
    const user = await makeLocalUser();
    const secret = generateSessionSecret();
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(secret),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() + 60 * 60_000),
        lastSeenAt: new Date(
          Date.now() - (config.SESSION_IDLE_TIMEOUT_MINUTES + 5) * 60_000,
        ),
      },
    });
    createdSessionIds.push(session.id);

    const result = await validateSession(encodeCookieValue(session.id, secret));
    expect(result).toBeNull();
  });
});
