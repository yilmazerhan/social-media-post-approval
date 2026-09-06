/**
 * Builds the node-saml configuration from our application config —
 * AUTHENTICATION.md §3, ADR-003. `validateInResponseTo` is deliberately
 * `never`: the library's own InResponseTo cache would need a shared,
 * durable store across replicas, so instead we bind each response to the
 * request that produced it ourselves, statelessly, via a signed RelayState
 * — see relay-state.ts. The library's cacheProvider is consequently never
 * invoked; the no-op below only satisfies the type.
 */
import { readFileSync } from "node:fs";
import {
  ValidateInResponseTo,
  type CacheProvider,
  type SamlConfig,
} from "@node-saml/node-saml";
import { config } from "@/server/config";

const noopCacheProvider: CacheProvider = {
  saveAsync: async () => null,
  getAsync: async () => null,
  removeAsync: async () => null,
};

function splitCertificates(raw: string): string[] {
  const matches = raw.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  );
  return matches && matches.length > 0 ? matches : [raw.trim()];
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is required when AUTH_SAML_ENABLED=true (config validation should have caught this)`,
    );
  }
  return value;
}

let baseConfigCache: SamlConfig | undefined;

/** The static parts of the SAML configuration — safe to reuse across requests and instances. */
export function getBaseSamlConfig(): SamlConfig {
  if (baseConfigCache) return baseConfigCache;

  if (!config.AUTH_SAML_ENABLED) {
    throw new Error("SAML is not enabled (AUTH_SAML_ENABLED=false)");
  }
  if (!config.SAML_IDP_CERTIFICATE) {
    throw new Error(
      "SAML_IDP_METADATA_FILE-only configuration is not yet supported — set SAML_IDP_CERTIFICATE directly.",
    );
  }

  const idpCerts = splitCertificates(config.SAML_IDP_CERTIFICATE);
  const privateKey = config.SAML_SP_PRIVATE_KEY_FILE
    ? readFileSync(config.SAML_SP_PRIVATE_KEY_FILE, "utf8")
    : undefined;
  const publicCert = config.SAML_SP_CERTIFICATE_FILE
    ? readFileSync(config.SAML_SP_CERTIFICATE_FILE, "utf8")
    : undefined;

  baseConfigCache = {
    idpCert: idpCerts.length === 1 ? idpCerts[0] : idpCerts,
    issuer: required(config.SAML_ENTITY_ID, "SAML_ENTITY_ID"),
    callbackUrl: config.SAML_ACS_URL,
    entryPoint: required(config.SAML_IDP_SSO_URL, "SAML_IDP_SSO_URL"),
    idpIssuer: required(config.SAML_IDP_ENTITY_ID, "SAML_IDP_ENTITY_ID"),
    audience: required(config.SAML_ENTITY_ID, "SAML_ENTITY_ID"),
    wantAssertionsSigned: config.SAML_WANT_ASSERTIONS_SIGNED,
    wantAuthnResponseSigned: config.SAML_WANT_RESPONSE_SIGNED,
    acceptedClockSkewMs: config.SAML_CLOCK_SKEW_SECONDS * 1000,
    validateInResponseTo: ValidateInResponseTo.never,
    cacheProvider: noopCacheProvider,
    privateKey,
    publicCert,
    // node-saml only signs with sha1/sha256/sha512; sha384 (which our own
    // config allows as an accepted-algorithm preference) has no slot here,
    // so it falls back to sha256 for outgoing requests specifically.
    signatureAlgorithm:
      config.SAML_SIGNATURE_ALGORITHM === "sha384"
        ? "sha256"
        : config.SAML_SIGNATURE_ALGORITHM,
  };
  return baseConfigCache;
}
