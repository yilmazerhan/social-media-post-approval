import { NextRequest } from "next/server";
import { config } from "@/server/config";
import { jsonError, jsonSuccess } from "@/server/http/envelope";
import { getSessionContext } from "@/server/http/request-context";
import { generateCsrfToken, csrfCookieAttributes } from "@/server/http/csrf";
import { prisma } from "@/server/db";

export async function GET(request: NextRequest) {
  const context = await getSessionContext(request);
  if (!context) {
    return jsonError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }

  const roles = await prisma.userRole.findMany({
    where: { userId: context.user.id },
    include: { role: { select: { key: true, name: true } } },
  });

  const response = jsonSuccess({
    id: context.user.id,
    email: context.user.email,
    displayName: context.user.displayName,
    authProvider: context.user.authProvider,
    timezone: context.user.timezone ?? config.APP_TIMEZONE,
    roles: roles.map((r) => r.role.key),
  });
  // Re-primed on every call so a client that lost its CSRF cookie (but
  // still holds a valid session) can recover it before the next mutation.
  response.cookies.set(
    config.CSRF_COOKIE_NAME,
    generateCsrfToken(),
    csrfCookieAttributes,
  );
  return response;
}
