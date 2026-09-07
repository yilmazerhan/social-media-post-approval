import { config } from "@/server/config";
import { jsonError } from "@/server/http/envelope";
import { generateSpMetadata } from "@/modules/auth/saml";

export async function GET() {
  if (!config.AUTH_SAML_ENABLED) {
    return jsonError(404, "NOT_FOUND", "SAML sign-in is not enabled.");
  }

  const xml = generateSpMetadata();
  return new Response(xml, {
    headers: { "Content-Type": "application/samlmetadata+xml" },
  });
}
