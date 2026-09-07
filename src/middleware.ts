import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP security headers and CSP — SECURITY.md §3. "Set at Nginx and
 * asserted by the application's middleware (defence in depth)": Nginx
 * doesn't exist yet (Phase 27), so every one of these is a hard
 * requirement here for now, not a duplicate. Runs on every response,
 * including API routes — a header a browser enforces is worth more than
 * one only the HTML shell carries.
 *
 * The nonce is generated with Web Crypto rather than `node:crypto` so
 * this file stays edge-runtime-compatible (Next's default middleware
 * runtime); `@/server/config`'s env loader isn't edge-safe (it can read
 * `*_FILE` secrets off disk), so `APP_URL`/`AUTH_SAML_ENABLED`/
 * `SAML_IDP_SSO_URL` are read directly from `process.env` here instead —
 * none of the three is credential material, so the `_FILE` indirection
 * those three variables get elsewhere isn't needed for them.
 */

function nonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonceValue: string): string {
  const formActionOrigins = ["'self'"];
  if (
    process.env.AUTH_SAML_ENABLED === "true" &&
    process.env.SAML_IDP_SSO_URL
  ) {
    try {
      formActionOrigins.push(new URL(process.env.SAML_IDP_SSO_URL).origin);
    } catch {
      // Malformed SAML_IDP_SSO_URL is a startup-time config error caught by
      // src/server/config.ts's own validation — never reached in practice.
    }
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonceValue}'`,
    `style-src 'self' 'nonce-${nonceValue}'`,
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    `form-action ${formActionOrigins.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const nonceValue = nonce();
  const csp = buildCsp(nonceValue);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonceValue);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  return response;
}

export const config = {
  matcher: [
    /*
     * Every path except Next's own static assets and the favicon — those
     * are immutable, fingerprinted files with nothing to gain from a CSP
     * header and no reason to spend a nonce on.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
