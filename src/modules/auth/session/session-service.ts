/**
 * Server-side session lifecycle — AUTHENTICATION.md §4. Sessions are rows
 * in the database, not stateless tokens, which is what makes revocation,
 * "logout everywhere", idle/absolute timeout and immediate invalidation on
 * user disablement actually work.
 */
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import type { AuthProvider, Session, User } from "@/generated/prisma/client";
import {
  decodeCookieValue,
  encodeCookieValue,
  generateSessionSecret,
  hashSecret,
  secretMatchesHash,
} from "./cookie";

export type RevokedReason =
  | "LOGOUT"
  | "LOGOUT_ALL"
  | "ADMIN"
  | "USER_DISABLED"
  | "PASSWORD_CHANGED"
  | "EXPIRED";

const LAST_SEEN_UPDATE_THROTTLE_MS = 60_000;

export interface CreateSessionInput {
  userId: string;
  authProvider: AuthProvider;
  ipAddress?: string | null;
  userAgent?: string | null;
  samlSessionIndex?: string | null;
}

export interface ValidSession {
  session: Session;
  user: User;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<{ session: Session; cookieValue: string }> {
  const secret = generateSessionSecret();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.SESSION_ABSOLUTE_TIMEOUT_MINUTES * 60_000,
  );

  const session = await prisma.session.create({
    data: {
      userId: input.userId,
      tokenHash: hashSecret(secret),
      authProvider: input.authProvider,
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ? input.userAgent.slice(0, 512) : undefined,
      samlSessionIndex: input.samlSessionIndex ?? undefined,
      expiresAt,
      lastSeenAt: now,
    },
  });

  return { session, cookieValue: encodeCookieValue(session.id, secret) };
}

/**
 * Looks up, verifies and (when still valid) refreshes a session from its
 * cookie value. Returns null for anything wrong with it — expired, idle
 * too long, revoked, a bad secret, or a user who is no longer active —
 * revoking the row along the way so the same dead cookie fails fast next
 * time too.
 */
export async function validateSession(
  cookieValue: string,
): Promise<ValidSession | null> {
  const decoded = decodeCookieValue(cookieValue);
  if (!decoded) return null;

  const session = await prisma.session.findUnique({
    where: { id: decoded.sessionId },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (!secretMatchesHash(decoded.secret, session.tokenHash)) return null;

  const now = new Date();

  if (session.expiresAt <= now) {
    await revokeSession(session.id, "EXPIRED");
    return null;
  }

  const idleDeadline = new Date(
    session.lastSeenAt.getTime() + config.SESSION_IDLE_TIMEOUT_MINUTES * 60_000,
  );
  if (idleDeadline <= now) {
    await revokeSession(session.id, "EXPIRED");
    return null;
  }

  const { user } = session;
  if (user.status !== "ACTIVE" || user.deletedAt) {
    await revokeSession(session.id, "USER_DISABLED");
    return null;
  }

  if (
    now.getTime() - session.lastSeenAt.getTime() >
    LAST_SEEN_UPDATE_THROTTLE_MS
  ) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: now } })
      .catch(() => undefined);
  }

  return { session, user };
}

export async function revokeSession(
  sessionId: string,
  reason: RevokedReason,
): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function revokeAllUserSessions(
  userId: string,
  reason: RevokedReason,
  exceptSessionId?: string,
): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}
