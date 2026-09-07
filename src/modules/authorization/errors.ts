import type { PermissionKey } from "./permissions";

export class ForbiddenError extends Error {
  constructor(public readonly permission: PermissionKey) {
    super(`Not authorized: ${permission}`);
  }
}
