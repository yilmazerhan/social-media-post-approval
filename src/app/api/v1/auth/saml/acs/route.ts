import { NextRequest, NextResponse } from "next/server";
import { config } from "@/server/config";
import {
  SESSION_COOKIE_NAME,
  sessionCookieAttributes,
} from "@/modules/auth/session";
import {
  processSamlAcs,
  SamlDisabledError,
  SamlRejectedError,
} from "@/modules/auth/saml";
import { getClientIp, getUserAgent } from "@/server/http/request-context";

/**
 * No CSRF check here by design — the browser arrives via a same-origin
 * form POST submitted by the IdP, not by us, so there is no Origin header
 * to check against. Protection is the validation chain in
 * modules/auth/saml/acs.ts instead (signature, issuer, audience,
 * timestamps, InResponseTo, replay).
 */
export async function POST(request: NextRequest) {
  if (!config.AUTH_SAML_ENABLED) {
    return NextResponse.redirect(
      new URL("/login?error=saml_disabled", config.APP_URL),
    );
  }

  const formData = await request.formData().catch(() => null);
  const samlResponse = formData?.get("SAMLResponse");
  const relayState = formData?.get("RelayState");

  if (typeof samlResponse !== "string" || typeof relayState !== "string") {
    return NextResponse.redirect(
      new URL("/login?error=saml_invalid", config.APP_URL),
    );
  }

  try {
    const result = await processSamlAcs({
      samlResponse,
      relayState,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    const response = NextResponse.redirect(
      new URL(result.redirectPath, config.APP_URL),
    );
    response.cookies.set(SESSION_COOKIE_NAME, result.cookieValue, {
      ...sessionCookieAttributes,
      maxAge: config.SESSION_ABSOLUTE_TIMEOUT_MINUTES * 60,
    });
    return response;
  } catch (err) {
    if (err instanceof SamlRejectedError || err instanceof SamlDisabledError) {
      return NextResponse.redirect(
        new URL("/login?error=saml_rejected", config.APP_URL),
      );
    }
    throw err;
  }
}
