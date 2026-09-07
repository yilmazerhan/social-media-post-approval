import type { AssignmentStatus } from "@/generated/prisma/client";
import type { PermissionKey } from "./permissions";

export type { PermissionKey };

/** Everything a policy decision needs about the acting user, resolved once per request. */
export interface AuthorizedUser {
  id: string;
  departmentId: string | null;
  permissions: ReadonlySet<PermissionKey>;
  groupIds: ReadonlySet<string>;
}

/** The open-assignment shape POST_APPROVE/POST_REJECT/POST_REQUEST_CHANGES and APPROVAL_READ check against. */
export interface AssignmentTarget {
  assigneeUserId: string | null;
  assigneeGroupId: string | null;
}

/**
 * The resource a policy-scoped permission decision needs, always loaded by
 * the caller before calling `can`/`assert` — see AUTHENTICATION.md §5.
 * Every other permission in the catalogue is grant-only and needs none of
 * these; pass no resource at all for those.
 */
export type PolicyResource =
  | { kind: "owned-post"; creatorId: string }
  | {
      kind: "approval-action";
      postCreatorId: string;
      /** The post version this action targets — must match the open assignment's. */
      postVersionId: string;
      assignment:
        | (AssignmentTarget & {
            postVersionId: string;
            status: AssignmentStatus;
          })
        | null;
    }
  | {
      kind: "approval-read";
      postDepartmentId: string | null;
      assignment: AssignmentTarget | null;
    };
