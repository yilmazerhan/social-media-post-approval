import type { Priority } from "@/generated/prisma/client";
import { getApprovalQueue } from "@/modules/approvals";
import { loadAuthorizedUser, ForbiddenError } from "@/modules/authorization";
import { protectedHandler } from "@/server/http/handler";
import { jsonError } from "@/server/http/envelope";

const PRIORITY_VALUES: readonly Priority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];

/**
 * `?dueSoon&overdue&dueToday&unassigned&myGroupOnly&priority=&departmentId=&page=&pageSize=`
 * — API.md's `/queue`. Deliberately doesn't use `protectedHandler`'s
 * `permission` option: `APPROVAL_READ` is dual-purpose (grant-only for
 * "my queue," resource-scoped via `checkApprovalRead` for reading one
 * post) and `assert()` always takes the resource-scoped path for this
 * key — right for `GET /:postId`, wrong here, since the query itself
 * (`assignedToMeFilter`) already is the per-row scoping. Checked directly
 * against the grant instead.
 */
export const GET = protectedHandler({}, async ({ request, user }) => {
  const authz = await loadAuthorizedUser(user.id);
  if (!authz.permissions.has("APPROVAL_READ")) {
    throw new ForbiddenError("APPROVAL_READ");
  }

  const params = new URL(request.url).searchParams;

  const priorityParam = params.get("priority");
  if (
    priorityParam &&
    !(PRIORITY_VALUES as readonly string[]).includes(priorityParam)
  ) {
    return {
      raw: jsonError(422, "VALIDATION_FAILED", "Invalid priority.", [
        {
          field: "priority",
          message: "Must be one of LOW, NORMAL, HIGH, URGENT.",
        },
      ]),
    };
  }

  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");

  const result = await getApprovalQueue(authz, {
    dueSoon: params.has("dueSoon"),
    overdue: params.has("overdue"),
    dueToday: params.has("dueToday"),
    unassigned: params.has("unassigned"),
    myGroupOnly: params.has("myGroupOnly"),
    priority: priorityParam ? (priorityParam as Priority) : undefined,
    departmentId: params.get("departmentId") ?? undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
  });

  return {
    data: result.items,
    meta: { page: result.page, pageSize: result.pageSize, total: result.total },
  };
});
