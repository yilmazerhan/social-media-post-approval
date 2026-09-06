import { getNextInQueue } from "@/modules/approvals";
import { loadAuthorizedUser, ForbiddenError } from "@/modules/authorization";
import { protectedHandler } from "@/server/http/handler";
import { jsonError } from "@/server/http/envelope";

/** `?after=:postId` — API.md's `/next`, the queue's keyboard-nav flow. Same grant-only check as `/queue` (see its own comment). */
export const GET = protectedHandler({}, async ({ request, user }) => {
  const authz = await loadAuthorizedUser(user.id);
  if (!authz.permissions.has("APPROVAL_READ")) {
    throw new ForbiddenError("APPROVAL_READ");
  }

  const after = new URL(request.url).searchParams.get("after");
  if (!after) {
    return {
      raw: jsonError(422, "VALIDATION_FAILED", "after is required.", [
        { field: "after", message: "Required." },
      ]),
    };
  }

  const next = await getNextInQueue(authz, after);
  return { data: next };
});
