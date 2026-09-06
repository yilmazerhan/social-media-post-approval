/**
 * The reusable protected-route wrapper — ARCHITECTURE.md §3's request
 * lifecycle and AUTHENTICATION.md §5's enforcement checklist, implemented
 * once: resolve session → CSRF → validate → load resource → authorize →
 * workflow guard → execute. "Execute" (and any audit row it writes inside
 * its own transaction) stays the caller's job — CLAUDE.md's house rule is
 * authenticate → authorize → validate → execute in a transaction → audit,
 * and only the module service calling this wrapper knows what belongs in
 * that transaction.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import type { Session, User } from "@/generated/prisma/client";
import {
  assert,
  loadAuthorizedUser,
  ForbiddenError,
  type AuthorizedUser,
  type PermissionKey,
  type PolicyResource,
} from "@/modules/authorization";
import { createLogger } from "@/server/logger";
import { getSessionContext } from "./request-context";
import { verifyCsrf } from "./csrf";
import { jsonError, jsonSuccess } from "./envelope";

const logger = createLogger("http");

export class NotFoundError extends Error {}

/** A blocked workflow-state transition — maps to API.md's 409 codes. */
export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_TRANSITION"
      | "ALREADY_DECIDED"
      | "STALE_RESOURCE" = "INVALID_TRANSITION",
  ) {
    super(message);
  }
}

/** A business-rule validation failure discovered against loaded state (not the request body) — e.g. the readiness checklist at submit time. Maps to 422 like a Zod failure. */
export class NotReadyError extends Error {
  constructor(
    message: string,
    public readonly details: { field: string; message: string }[],
  ) {
    super(message);
  }
}

/** An uploaded file rejected by the pipeline (ARCHITECTURE.md §6) — maps to API.md's 413/415/422 upload codes. */
export class FileRejectedError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "FILE_TOO_LARGE"
      | "FILE_TYPE_REJECTED"
      | "UPLOAD_FAILED" = "FILE_TYPE_REJECTED",
  ) {
    super(message);
  }
}

/** A decision body missing its mandatory comment (request-changes) or reason (reject) — API.md §3's `COMMENT_REQUIRED` example. */
export class CommentRequiredError extends Error {
  constructor(
    message: string,
    public readonly field: string,
  ) {
    super(message);
  }
}

/** API.md's `409 PROVIDER_MISMATCH` — an action that only makes sense for one `authProvider` (e.g. admin password reset, LOCAL-only) attempted against the other. */
export class ProviderMismatchError extends Error {
  constructor(
    message = "This action isn't available for this account's sign-in provider.",
  ) {
    super(message);
  }
}

/** A password that fails `checkPasswordPolicy` — reusable outside `auth/local`'s own self-service flows (e.g. an admin-triggered reset) which have their own identically-shaped error and don't go through this wrapper. */
export class PasswordPolicyError extends Error {
  constructor(public readonly violations: string[]) {
    super("Password does not meet policy.");
  }
}

export interface RouteContext {
  params: Promise<Record<string, string>>;
}

export interface ExecuteContext<TInput, TResource> {
  request: NextRequest;
  session: Session;
  user: User;
  authz: AuthorizedUser;
  params: Record<string, string>;
  input: TInput;
  resource: TResource;
}

export interface ExecuteResult {
  data?: unknown;
  status?: number;
  meta?: Record<string, unknown>;
  headers?: HeadersInit;
  /** Bypasses the JSON envelope entirely — a streamed file, or an empty 204. Takes precedence over `data`. */
  raw?: NextResponse;
}

export interface LoadResourceContext<TInput> {
  request: NextRequest;
  user: User;
  authz: AuthorizedUser;
  params: Record<string, string>;
  input: TInput;
}

export interface LoadedResource<TResource> {
  resource: TResource;
  /** Omit when the permission is grant-only and needs no resource-level check. */
  policyResource?: PolicyResource;
}

export interface ProtectedHandlerOptions<TInput, TResource> {
  /** Parses the JSON body. Omit for a route with none (GET, or a DELETE with only route params). */
  schema?: ZodType<TInput>;
  /** Defaults to `{ requireToken: true }` — every endpoint behind this wrapper acts on an existing session. */
  csrf?: { requireToken: boolean };
  permission?: PermissionKey;
  /** Loads the acted-on resource. Returning `null`/`undefined` responds 404. Required whenever `permission` is resource-scoped. */
  loadResource?: (
    ctx: LoadResourceContext<TInput>,
  ) => Promise<LoadedResource<TResource> | null | undefined>;
  /** Throw a WorkflowError to reject an invalid state transition before `execute` runs. */
  workflowGuard?: (ctx: {
    user: User;
    authz: AuthorizedUser;
    input: TInput;
    resource: TResource;
  }) => void | Promise<void>;
}

const EMPTY_AUTHZ_PERMISSIONS: ReadonlySet<PermissionKey> = new Set();
const EMPTY_GROUP_IDS: ReadonlySet<string> = new Set();

export function protectedHandler<TInput = undefined, TResource = undefined>(
  options: ProtectedHandlerOptions<TInput, TResource>,
  execute: (ctx: ExecuteContext<TInput, TResource>) => Promise<ExecuteResult>,
) {
  return async function routeHandler(
    request: NextRequest,
    routeContext?: RouteContext,
  ): Promise<NextResponse> {
    try {
      const sessionContext = await getSessionContext(request);
      if (!sessionContext) {
        return jsonError(401, "UNAUTHENTICATED", "Sign in to continue.");
      }
      const { session, user } = sessionContext;

      if (!verifyCsrf(request, options.csrf ?? { requireToken: true })) {
        return jsonError(403, "CSRF_FAILED", "Request could not be verified.");
      }

      let input: TInput;
      if (options.schema) {
        const raw = await request.json().catch(() => null);
        const parsed = options.schema.safeParse(raw);
        if (!parsed.success) {
          return jsonError(
            422,
            "VALIDATION_FAILED",
            "Some fields need attention.",
            parsed.error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          );
        }
        input = parsed.data;
      } else {
        input = undefined as TInput;
      }

      const params = routeContext ? await routeContext.params : {};

      // Only resolved (an extra query) when a permission check actually needs it.
      const authz: AuthorizedUser = options.permission
        ? await loadAuthorizedUser(user.id)
        : {
            id: user.id,
            departmentId: user.departmentId,
            permissions: EMPTY_AUTHZ_PERMISSIONS,
            groupIds: EMPTY_GROUP_IDS,
          };

      let resource: TResource = undefined as TResource;
      let policyResource: PolicyResource | undefined;
      if (options.loadResource) {
        const loaded = await options.loadResource({
          request,
          user,
          authz,
          params,
          input,
        });
        if (!loaded) {
          return jsonError(404, "NOT_FOUND", "Not found.");
        }
        resource = loaded.resource;
        policyResource = loaded.policyResource;
      }

      if (options.permission) {
        assert(authz, options.permission, policyResource);
      }

      if (options.workflowGuard) {
        await options.workflowGuard({ user, authz, input, resource });
      }

      const result = await execute({
        request,
        session,
        user,
        authz,
        params,
        input,
        resource,
      });
      if (result.raw) return result.raw;
      return jsonSuccess(result.data, {
        status: result.status,
        meta: result.meta,
        headers: result.headers,
      });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return jsonError(
          403,
          "FORBIDDEN",
          "You are not authorized to do that.",
        );
      }
      if (err instanceof NotFoundError) {
        return jsonError(404, "NOT_FOUND", err.message || "Not found.");
      }
      if (err instanceof WorkflowError) {
        return jsonError(409, err.code, err.message);
      }
      if (err instanceof NotReadyError) {
        return jsonError(422, "VALIDATION_FAILED", err.message, err.details);
      }
      if (err instanceof FileRejectedError) {
        const status =
          err.code === "FILE_TOO_LARGE"
            ? 413
            : err.code === "FILE_TYPE_REJECTED"
              ? 415
              : 422;
        return jsonError(status, err.code, err.message);
      }
      if (err instanceof CommentRequiredError) {
        return jsonError(422, "COMMENT_REQUIRED", err.message, [
          { field: err.field, message: "Required." },
        ]);
      }
      if (err instanceof ProviderMismatchError) {
        return jsonError(409, "PROVIDER_MISMATCH", err.message);
      }
      if (err instanceof PasswordPolicyError) {
        return jsonError(
          422,
          "VALIDATION_FAILED",
          err.message,
          err.violations.map((message) => ({ field: "newPassword", message })),
        );
      }
      logger.error({ err }, "Unhandled error in protected handler");
      return jsonError(500, "INTERNAL_ERROR", "Something went wrong.");
    }
  };
}
