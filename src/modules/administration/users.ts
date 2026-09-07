/**
 * User administration — API.md's `/api/v1/users*`, UI_UX_SPEC.md §6's
 * Users section. "An administrator can run the system without touching
 * the database" (IMPLEMENTATION_PLAN.md Phase 21) starts here: create,
 * enable/disable (with session revocation), role assignment, and
 * LOCAL-only password reset — Entra users never get a password
 * affordance because `authProvider === "LOCAL"` gates every one of these
 * password-shaped operations, the same check `auth/local` itself uses.
 */
import { randomBytes, createHash } from "node:crypto";
import type { Prisma, UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import {
  NotFoundError,
  ProviderMismatchError,
  PasswordPolicyError,
} from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import { revokeAllUserSessions } from "@/modules/auth/session";
import { hashPassword, checkPasswordPolicy } from "@/modules/auth/local";
import { sendTemplatedEmail } from "@/modules/email";

export interface UserSummaryDto {
  id: string;
  email: string;
  displayName: string;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  status: UserStatus;
  authProvider: "LOCAL" | "ENTRA_ID";
  roleKeys: string[];
  lastLoginAt: string | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function toSummary(
  user: Prisma.UserGetPayload<{
    include: {
      department: { select: { name: true } };
      roles: { include: { role: true } };
    };
  }>,
): Promise<UserSummaryDto> {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    jobTitle: user.jobTitle,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
    status: user.status,
    authProvider: user.authProvider,
    roleKeys: user.roles.map((r) => r.role.key),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export interface ListUsersFilters {
  q?: string;
  status?: UserStatus;
  departmentId?: string;
  page: number;
  pageSize: number;
}

export async function listUsers(
  filters: ListUsersFilters,
): Promise<{ items: UserSummaryDto[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.q
      ? {
          OR: [
            { displayName: { contains: filters.q, mode: "insensitive" } },
            { email: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        department: { select: { name: true } },
        roles: { include: { role: true } },
      },
      orderBy: { displayName: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: await Promise.all(rows.map(toSummary)), total };
}

export async function getUserDetail(id: string): Promise<UserSummaryDto> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      department: { select: { name: true } },
      roles: { include: { role: true } },
    },
  });
  if (!user || user.deletedAt) throw new NotFoundError();
  return toSummary(user);
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  departmentId?: string | null;
  roleKeys: string[];
}

/** Created LOCAL, PENDING, with no password — a reset link (the same `password_reset` template, no separate "welcome" email invented) is how they set their first one. */
export async function createUser(
  input: CreateUserInput,
  actorId: string,
): Promise<UserSummaryDto> {
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        displayName: input.displayName,
        firstName: input.firstName,
        lastName: input.lastName,
        jobTitle: input.jobTitle ?? null,
        departmentId: input.departmentId ?? null,
        authProvider: "LOCAL",
        status: "PENDING",
      },
    });

    if (input.roleKeys.length > 0) {
      const roles = await tx.role.findMany({
        where: { key: { in: input.roleKeys } },
      });
      await tx.userRole.createMany({
        data: roles.map((role) => ({
          userId: created.id,
          roleId: role.id,
          grantedById: actorId,
        })),
      });
    }

    await writeAudit(
      {
        actorId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: created.id,
      },
      tx,
    );

    const rawToken = randomBytes(32).toString("base64url");
    await tx.passwordResetToken.create({
      data: {
        userId: created.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(
          Date.now() + config.PASSWORD_RESET_TTL_MINUTES * 60_000,
        ),
      },
    });
    await sendTemplatedEmail(
      {
        templateKey: "password_reset",
        to: created.email,
        variables: {
          appName: config.APP_NAME,
          resetUrl: `${config.APP_URL}/reset-password?token=${rawToken}`,
          ttlMinutes: config.PASSWORD_RESET_TTL_MINUTES,
        },
        userId: created.id,
      },
      tx,
    );

    return created;
  });

  return getUserDetail(user.id);
}

export interface UpdateUserInput {
  displayName?: string;
  jobTitle?: string | null;
  departmentId?: string | null;
  timezone?: string | null;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId: string,
): Promise<UserSummaryDto> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: input });
    await writeAudit(
      { actorId, action: "USER_UPDATED", entityType: "User", entityId: id },
      tx,
    );
  });
  return getUserDetail(id);
}

/** `POST /:id/enable` / `POST /:id/disable` (API.md) — disabling revokes every session immediately (AUTHENTICATION.md's "immediate invalidation on user disablement"). */
export async function setUserEnabled(
  id: string,
  enabled: boolean,
  actorId: string,
): Promise<UserSummaryDto> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new NotFoundError();

  await prisma.user.update({
    where: { id },
    data: { status: enabled ? "ACTIVE" : "DISABLED" },
  });
  if (!enabled) {
    await revokeAllUserSessions(id, "USER_DISABLED");
  }
  await writeAudit({
    actorId,
    action: enabled ? "USER_ENABLED" : "USER_DISABLED",
    entityType: "User",
    entityId: id,
  });
  return getUserDetail(id);
}

export async function assignRole(
  userId: string,
  roleKey: string,
  actorId: string,
): Promise<UserSummaryDto> {
  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.role.findUnique({ where: { key: roleKey } }),
  ]);
  if (!user || user.deletedAt || !role) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id, grantedById: actorId },
      update: {},
    });
    await writeAudit(
      {
        actorId,
        action: "USER_ROLE_ASSIGNED",
        entityType: "User",
        entityId: userId,
        metadata: { roleKey },
      },
      tx,
    );
  });
  if (config.SESSION_REVOKE_ON_ROLE_CHANGE) {
    await revokeAllUserSessions(userId, "ROLE_CHANGED");
  }
  return getUserDetail(userId);
}

export async function removeRole(
  userId: string,
  roleKey: string,
  actorId: string,
): Promise<UserSummaryDto> {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId, roleId: role.id } });
    await writeAudit(
      {
        actorId,
        action: "USER_ROLE_REMOVED",
        entityType: "User",
        entityId: userId,
        metadata: { roleKey },
      },
      tx,
    );
  });
  if (config.SESSION_REVOKE_ON_ROLE_CHANGE) {
    await revokeAllUserSessions(userId, "ROLE_CHANGED");
  }
  return getUserDetail(userId);
}

/** `POST /:id/password-reset` — LOCAL only, `409 PROVIDER_MISMATCH` for Entra (API.md). Sets the password directly (an admin action, not a self-service token flow) and forces a change at next login. */
export async function adminResetPassword(
  id: string,
  newPassword: string,
  actorId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.deletedAt) throw new NotFoundError();
  if (user.authProvider !== "LOCAL") {
    throw new ProviderMismatchError();
  }
  const violations = checkPasswordPolicy(newPassword, {
    email: user.email,
    displayName: user.displayName,
  });
  if (violations.length > 0) throw new PasswordPolicyError(violations);

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        status: user.status === "PENDING" ? "ACTIVE" : user.status,
      },
    });
    await tx.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "PASSWORD_CHANGED" },
    });
    await writeAudit(
      {
        actorId,
        action: "USER_PASSWORD_RESET_BY_ADMIN",
        entityType: "User",
        entityId: id,
      },
      tx,
    );
  });
}

export interface AdminSessionDto {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  authProvider: string;
}

/** `GET /:id/sessions` (API.md) — an admin's view of another user's active sessions. */
export async function listUserSessions(
  userId: string,
): Promise<AdminSessionDto[]> {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
  });
  return sessions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    authProvider: s.authProvider,
  }));
}

/** `DELETE /:id/sessions` (API.md) — revokes every active session for that user. */
export async function revokeAllSessionsForUser(
  userId: string,
  actorId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new NotFoundError();

  await revokeAllUserSessions(userId, "ADMIN");
  await writeAudit({
    actorId,
    action: "USER_SESSIONS_REVOKED",
    entityType: "User",
    entityId: userId,
  });
}
