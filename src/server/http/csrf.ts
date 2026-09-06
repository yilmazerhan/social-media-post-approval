/**
 * CSRF protection — SECURITY.md §2. Double-submit token plus an
 * Origin/Sec-Fetch-Site check. The SAML ACS endpoint is exempt by
 * necessity (the browser is redirected there by the IdP, not by us) and
 * is instead protected by signature validation, InResponseTo binding and
 * replay protection — see AUTHENTICATION.md §3.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { config } from "@/server/config";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export const csrfCookieAttributes = {
  httpOnly: false,
  secure: config.COOKIE_SECURE,
  sameSite: "lax" as const,
  path: "/",
};

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function originAllowed(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") return false;

  const origin =
    request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) return true; // no browser-supplied origin header at all (e.g. some non-browser clients)

  try {
    const originUrl = new URL(origin);
    const appUrl = new URL(config.APP_URL);
    return originUrl.origin === appUrl.origin;
  } catch {
    return false;
  }
}

function checkCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(config.CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken) return false;
  return timingSafeStringEqual(cookieToken, headerToken);
}

/**
 * Returns true when the request passes CSRF checks. Safe methods always
 * pass. `requireToken: false` is for endpoints an unauthenticated visitor
 * must be able to call before any CSRF cookie could exist — login,
 * forgot/reset password — where the Origin/Sec-Fetch-Site check alone is
 * the defence (a cross-site POST still can't succeed without valid
 * credentials, and the session below is freshly rotated regardless).
 * Every endpoint that acts on an existing session requires the token too.
 */
export function verifyCsrf(
  request: NextRequest,
  options: { requireToken: boolean },
): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (!originAllowed(request)) return false;
  if (options.requireToken && !checkCsrfToken(request)) return false;
  return true;
}
