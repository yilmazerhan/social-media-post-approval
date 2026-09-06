/**
 * Centralized RBAC decision service — authorization.can/assert. See AUTHENTICATION.md §5.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export { PERMISSIONS, type PermissionKey } from "./permissions";
export type { AuthorizedUser, AssignmentTarget, PolicyResource } from "./types";
export { ForbiddenError } from "./errors";
export { can, assert, loadAuthorizedUser, serializeGrants } from "./service";
