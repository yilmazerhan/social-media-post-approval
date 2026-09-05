import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/server/http/envelope";
import { verifyCsrf } from "@/server/http/csrf";
import { getSessionContext } from "@/server/http/request-context";
import {
  revokeAllUserSessions,
  SESSION_COOKIE_NAME,
} from "@/modules/auth/session";
import { writeAudit } from "@/modules/audit";

export async function POST(request: NextRequest) {
  if (!verifyCsrf(request, { requireToken: true })) {
    return jsonError(403, "CSRF_FAILED", "Request could not be verified.");
  }

  const context = await getSessionContext(request);
  if (!context) {
    return jsonError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }

  await revokeAllUserSessions(context.user.id, "LOGOUT_ALL");
  await writeAudit({
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "AUTH_LOGOUT_ALL",
    entityType: "User",
    entityId: context.user.id,
  });

  const response = jsonSuccess({ loggedOut: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
