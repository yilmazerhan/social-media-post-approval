/**
 * The RBAC decision service — AUTHENTICATION.md §5. `can`/`assert` are pure
 * and synchronous: everything they need (granted permissions, group
 * membership, department, and the resource) is loaded once by the caller
 * beforehand, so a decision never triggers a surprise query and an IDOR
 * attempt fails on a loaded — not a missing — check.
 */
import { prisma } from "@/server/db";
import { PERMISSIONS, type PermissionKey } from "./permissions";
import type { AuthorizedUser, PolicyResource } from "./types";
import {
  checkApprovalAction,
  checkApprovalRead,
  checkCancelPost,
  checkOwnedPost,
} from "./policies";
import { ForbiddenError } from "./errors";

const OWNED_POST_PERMISSIONS = new Set<PermissionKey>([
  "POST_READ_OWN",
  "POST_EDIT_OWN",
  "POST_SUBMIT",
  "POST_DELETE_OWN",
]);
const APPROVAL_ACTION_PERMISSIONS = new Set<PermissionKey>([
  "POST_APPROVE",
  "POST_REJECT",
  "POST_REQUEST_CHANGES",
]);

export function can(
  user: AuthorizedUser,
  permission: PermissionKey,
  resource?: PolicyResource,
): boolean {
  if (!user.permissions.has(permission)) return false;

  if (OWNED_POST_PERMISSIONS.has(permission)) {
    return checkOwnedPost(user, resource);
  }
  if (permission === "POST_CANCEL") {
    return checkCancelPost(user, resource);
  }
  if (APPROVAL_ACTION_PERMISSIONS.has(permission)) {
    return checkApprovalAction(user, resource);
  }
  if (permission === "APPROVAL_READ") {
    return checkApprovalRead(user, resource);
  }

  return true; // grant-only permission — already checked above
}

export function assert(
  user: AuthorizedUser,
  permission: PermissionKey,
  resource?: PolicyResource,
): void {
  if (!can(user, permission, resource)) {
    throw new ForbiddenError(permission);
  }
}

/** Resolves everything a policy decision needs about a user, in one shot. */
export async function loadAuthorizedUser(
  userId: string,
): Promise<AuthorizedUser> {
  const [user, permissionRows, groupRows] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { departmentId: true },
    }),
    prisma.permission.findMany({
      where: { roles: { some: { role: { users: { some: { userId } } } } } },
      select: { key: true },
    }),
    prisma.userGroup.findMany({ where: { userId }, select: { groupId: true } }),
  ]);

  return {
    id: userId,
    departmentId: user.departmentId,
    permissions: new Set(permissionRows.map((p) => p.key as PermissionKey)),
    groupIds: new Set(groupRows.map((g) => g.groupId)),
  };
}

/**
 * Grant-only permissions serialized as booleans for UI gating (nav items,
 * admin-area visibility) — resource-scoped permissions need a loaded
 * resource and are decided with `can()` where that resource is rendered.
 * "The button and the server can never disagree" because both read the
 * same `user.permissions` set this comes from.
 */
export function serializeGrants(
  user: AuthorizedUser,
): Record<PermissionKey, boolean> {
  const grants = {} as Record<PermissionKey, boolean>;
  for (const permission of PERMISSIONS) {
    grants[permission.key] = user.permissions.has(permission.key);
  }
  return grants;
}
