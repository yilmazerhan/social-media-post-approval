import { listMentionableUsers } from "@/modules/comments";
import { loadAuthorizedUser } from "@/modules/authorization";
import { protectedHandler } from "@/server/http/handler";

/** `?q=` — API.md: "powers `@` autocomplete and returns only users the caller may mention." */
export const GET = protectedHandler({}, async ({ request, user }) => {
  const authz = await loadAuthorizedUser(user.id);
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const users = await listMentionableUsers(authz, query);
  return { data: users };
});
