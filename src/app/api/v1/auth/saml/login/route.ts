import { NextRequest, NextResponse } from "next/server";
import { config } from "@/server/config";
import { jsonError } from "@/server/http/envelope";
import { buildLoginRedirectUrl } from "@/modules/auth/saml";

export async function GET(request: NextRequest) {
  if (!config.AUTH_SAML_ENABLED) {
    return jsonError(404, "NOT_FOUND", "SAML sign-in is not enabled.");
  }

  const requested = request.nextUrl.searchParams.get("redirect") ?? "/";
  const redirectPath =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const authorizeUrl = await buildLoginRedirectUrl(redirectPath);
  return NextResponse.redirect(authorizeUrl);
}
