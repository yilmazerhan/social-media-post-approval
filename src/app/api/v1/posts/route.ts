import type { Priority } from "@/generated/prisma/client";
import {
  createPostSchema,
  createDraft,
  listPosts,
  type PostListTab,
} from "@/modules/posts";
import { loadAuthorizedUser, ForbiddenError } from "@/modules/authorization";
import { protectedHandler } from "@/server/http/handler";
import { jsonError } from "@/server/http/envelope";

const PRIORITY_VALUES: readonly Priority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];
const TAB_VALUES: readonly PostListTab[] = [
  "all",
  "drafts",
  "pending",
  "changes_requested",
  "approved",
  "rejected",
  "archived",
];

/**
 * `?tab=&search=&priority=&departmentId=&dateFrom=&dateTo=` — API.md's
 * "My Posts" list ("scoped list; tabs map to `status` filters"). Same
 * reasoning as `/approvals/queue` for checking the grant directly rather
 * than through `protectedHandler`'s `permission` option: there's no
 * single resource to scope `can()`'s `checkOwnedPost` against here — the
 * query itself (`creatorId: user.id`) is the scoping.
 */
export const GET = protectedHandler({}, async ({ request, user }) => {
  const authz = await loadAuthorizedUser(user.id);
  if (!authz.permissions.has("POST_READ_OWN")) {
    throw new ForbiddenError("POST_READ_OWN");
  }

  const params = new URL(request.url).searchParams;

  const tabParam = params.get("tab") ?? "all";
  if (!(TAB_VALUES as readonly string[]).includes(tabParam)) {
    return {
      raw: jsonError(422, "VALIDATION_FAILED", "Invalid tab.", [
        { field: "tab", message: `Must be one of ${TAB_VALUES.join(", ")}.` },
      ]),
    };
  }

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

  const dateFromParam = params.get("dateFrom");
  const dateToParam = params.get("dateTo");
  const dateFrom = dateFromParam ? new Date(dateFromParam) : undefined;
  const dateTo = dateToParam ? new Date(dateToParam) : undefined;
  if (
    (dateFrom && Number.isNaN(dateFrom.getTime())) ||
    (dateTo && Number.isNaN(dateTo.getTime()))
  ) {
    return {
      raw: jsonError(422, "VALIDATION_FAILED", "Invalid date range.", [
        { field: "dateFrom", message: "Must be a valid ISO date." },
      ]),
    };
  }

  const rows = await listPosts(user.id, {
    tab: tabParam as PostListTab,
    search: params.get("search") ?? undefined,
    priority: priorityParam ? (priorityParam as Priority) : undefined,
    departmentId: params.get("departmentId") ?? undefined,
    dateFrom,
    dateTo,
  });

  return { data: rows };
});

export const POST = protectedHandler(
  { schema: createPostSchema, permission: "POST_CREATE" },
  async ({ user, input }) => {
    const post = await createDraft({
      creatorId: user.id,
      creatorEmail: user.email,
      input,
    });
    return { data: post, status: 201 };
  },
);
