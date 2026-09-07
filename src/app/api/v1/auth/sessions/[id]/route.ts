import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/server/http/envelope";
import { verifyCsrf } from "@/server/http/csrf";
import { getSessionContext } from "@/server/http/request-context";
import { revokeSession } from "@/modules/auth/session";
import { writeAudit } from "@/modules/audit";
import { prisma } from "@/server/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!verifyCsrf(request, { requireToken: true })) {
    return jsonError(403, "CSRF_FAILED", "Request could not be verified.");
  }

  const context = await getSessionContext(request);
  if (!context) {
    return jsonError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }

  const { id } = await params;
  // Loaded and ownership-checked before acting — a session that exists
  // but belongs to someone else is reported as not found, not forbidden.
  const target = await prisma.session.findUnique({ where: { id } });
  if (!target || target.userId !== context.user.id) {
    return jsonError(404, "NOT_FOUND", "Session not found.");
  }

  await revokeSession(id, "LOGOUT");
  await writeAudit({
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "AUTH_SESSION_REVOKED",
    entityType: "Session",
    entityId: id,
  });

  return jsonSuccess({ revoked: true });
}
