import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/server/http/envelope";
import { getSessionContext } from "@/server/http/request-context";
import { prisma } from "@/server/db";

export async function GET(request: NextRequest) {
  const context = await getSessionContext(request);
  if (!context) {
    return jsonError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }

  const sessions = await prisma.session.findMany({
    where: { userId: context.user.id, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
      authProvider: true,
    },
  });

  return jsonSuccess(
    sessions.map((s) => ({ ...s, isCurrent: s.id === context.session.id })),
  );
}
