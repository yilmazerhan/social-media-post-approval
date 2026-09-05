import { randomBytes } from "node:crypto";
import { SAML } from "@node-saml/node-saml";
import { getBaseSamlConfig } from "./config";
import { createRelayState } from "./relay-state";

let acsClient: SAML | undefined;

/** Cached instance used to validate incoming responses at the ACS endpoint. */
export function getSamlClientForAcs(): SAML {
  if (!acsClient) acsClient = new SAML(getBaseSamlConfig());
  return acsClient;
}

function generateSamlRequestId(): string {
  // SAML IDs are xsd:ID (NCName) — must start with a letter or underscore.
  return `_${randomBytes(16).toString("hex")}`;
}

/**
 * Builds the SP-initiated redirect URL for a fresh login. Constructs a
 * one-off SAML instance so we can supply the exact request ID we embed in
 * the signed RelayState — see relay-state.ts.
 */
export async function buildLoginRedirectUrl(
  redirectPath: string,
): Promise<string> {
  const requestId = generateSamlRequestId();
  const relayState = createRelayState(requestId, redirectPath);
  const saml = new SAML({
    ...getBaseSamlConfig(),
    generateUniqueId: () => requestId,
  });
  return saml.getAuthorizeUrlAsync(relayState, undefined, {});
}

export function generateSpMetadata(): string {
  const saml = getSamlClientForAcs();
  return saml.generateServiceProviderMetadata(null, null);
}
