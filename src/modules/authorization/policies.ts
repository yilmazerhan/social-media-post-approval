/**
 * The three resource-scoped policies AUTHENTICATION.md §5 documents.
 * Every other permission in the catalogue is grant-only: holding it is the
 * whole decision, which `can()` in service.ts checks before ever reaching
 * this file.
 */
import type { AssignmentStatus } from "@/generated/prisma/client";
import type { AuthorizedUser, PolicyResource } from "./types";

/** DATABASE.md's own definition of "open" — see the partial unique index on ApprovalAssignment. */
const OPEN_ASSIGNMENT_STATUSES = new Set<AssignmentStatus>([
  "PENDING",
  "IN_PROGRESS",
]);

function targetsUser(
  user: AuthorizedUser,
  target: { assigneeUserId: string | null; assigneeGroupId: string | null },
): boolean {
  if (target.assigneeUserId === user.id) return true;
  return (
    target.assigneeGroupId !== null && user.groupIds.has(target.assigneeGroupId)
  );
}

export function checkOwnedPost(
  user: AuthorizedUser,
  resource: PolicyResource | undefined,
): boolean {
  if (!resource || resource.kind !== "owned-post") return false;
  return resource.creatorId === user.id;
}

/** `POST_CANCEL`'s own rule (API.md: "creator or admin") — `POST_READ_ALL` is the same admin-reach signal `checkApprovalRead` already uses. */
export function checkCancelPost(
  user: AuthorizedUser,
  resource: PolicyResource | undefined,
): boolean {
  if (!resource || resource.kind !== "owned-post") return false;
  if (resource.creatorId === user.id) return true;
  return user.permissions.has("POST_READ_ALL");
}

export function checkApprovalAction(
  user: AuthorizedUser,
  resource: PolicyResource | undefined,
): boolean {
  if (!resource || resource.kind !== "approval-action") return false;
  if (resource.postCreatorId === user.id) return false; // nobody approves their own content

  const { assignment } = resource;
  if (!assignment) return false;
  if (assignment.postVersionId !== resource.postVersionId) return false;
  if (!OPEN_ASSIGNMENT_STATUSES.has(assignment.status)) return false;

  return targetsUser(user, assignment);
}

export function checkApprovalRead(
  user: AuthorizedUser,
  resource: PolicyResource | undefined,
): boolean {
  if (!resource || resource.kind !== "approval-read") return false;
  if (user.permissions.has("POST_READ_ALL")) return true;
  if (resource.assignment && targetsUser(user, resource.assignment))
    return true;
  return (
    resource.postDepartmentId !== null &&
    resource.postDepartmentId === user.departmentId
  );
}
