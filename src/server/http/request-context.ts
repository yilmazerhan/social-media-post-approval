/** Per-request helpers shared by every route handler under /api/v1/auth. */
import type { NextRequest } from "next/server";
import { config } from "@/server/config";
import {
  SESSION_COOKIE_NAME,
  validateSession,
  type ValidSession,
} from "@/modules/auth/session";

export function getClientIp(request: NextRequest): string | null {
  if (config.TRUST_PROXY) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const ips = forwardedFor.split(",").map((ip) => ip.trim());
      const index = Math.max(0, ips.length - config.TRUST_PROXY_HOPS);
      return ips[index] ?? ips[0] ?? null;
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp;
  }
  return null;
}

export function getUserAgent(request: NextRequest): string | null {
  return request.headers.get("user-agent");
}

export async function getSessionContext(
  request: NextRequest,
): Promise<ValidSession | null> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookieValue) return null;
  return validateSession(cookieValue);
}
