/**
 * Builds fake, signed SAML Responses for the integration tests in
 * tests/integration/saml-acs.test.ts — simulating an Entra ID IdP without
 * a real tenant. Signs assertions with tests/fixtures/saml/idp-key.pem,
 * the same throwaway key pair the app is configured to trust in
 * .env.test (SAML_IDP_CERTIFICATE_FILE).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SignedXml } from "xml-crypto";

const IDP_KEY = readFileSync(join(__dirname, "idp-key.pem"), "utf8");

/** Must match .env.test's SAML_ENTITY_ID / SAML_IDP_ENTITY_ID / SAML_IDP_SSO_URL. */
export const TEST_SP_ENTITY_ID = "https://approval.test.local/saml";
export const TEST_IDP_ENTITY_ID = "https://test-idp.example.local/metadata";
export const TEST_ACS_URL = "http://localhost:3000/api/v1/auth/saml/acs";

let counter = 0;
export function uniqueId(): string {
  counter += 1;
  return `_test-${Date.now()}-${counter}`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BuildResponseOptions {
  inResponseTo: string;
  nameId?: string;
  assertionId?: string;
  responseId?: string;
  issueInstant?: Date;
  notBefore?: Date;
  notOnOrAfter?: Date;
  audience?: string;
  destination?: string;
  recipient?: string;
  sessionIndex?: string;
  signatureAlgorithm?: "sha256" | "sha1";
  /** Claim URI -> value(s), e.g. config.SAML_ATTR_EMAIL -> "user@authtest.local". */
  attributes?: Record<string, string | string[]>;
  responseIssuer?: string;
  omitSignature?: boolean;
}

function buildAttributeStatement(
  attributes: Record<string, string | string[]>,
): string {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return "";
  const attrs = entries
    .map(([name, value]) => {
      const values = Array.isArray(value) ? value : [value];
      const valueXml = values
        .map(
          (v) => `<saml:AttributeValue>${xmlEscape(v)}</saml:AttributeValue>`,
        )
        .join("");
      return `<saml:Attribute Name="${xmlEscape(name)}">${valueXml}</saml:Attribute>`;
    })
    .join("");
  return `<saml:AttributeStatement>${attrs}</saml:AttributeStatement>`;
}

/** Returns a base64-encoded SAMLResponse XML document, as posted by a browser to the ACS endpoint. */
export function buildSignedSamlResponse(options: BuildResponseOptions): string {
  const now = options.issueInstant ?? new Date();
  const notBefore = options.notBefore ?? new Date(now.getTime() - 60_000);
  const notOnOrAfter =
    options.notOnOrAfter ?? new Date(now.getTime() + 5 * 60_000);
  const assertionId = options.assertionId ?? uniqueId();
  const responseId = options.responseId ?? uniqueId();
  const issuer = options.responseIssuer ?? TEST_IDP_ENTITY_ID;
  const audience = options.audience ?? TEST_SP_ENTITY_ID;
  const destination = options.destination ?? TEST_ACS_URL;
  const recipient = options.recipient ?? TEST_ACS_URL;
  const sessionIndex = options.sessionIndex ?? "session-index-1";

  const nameIdXml =
    options.nameId === undefined || options.nameId.length > 0
      ? `<saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${xmlEscape(options.nameId ?? "user@authtest.local")}</saml:NameID>`
      : `<saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent"/>`;

  const attributeStatement = buildAttributeStatement(options.attributes ?? {});

  const subject = `<saml:Subject>${nameIdXml}<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter.toISOString()}" Recipient="${xmlEscape(recipient)}" InResponseTo="${xmlEscape(options.inResponseTo)}"/></saml:SubjectConfirmation></saml:Subject>`;
  const conditions = `<saml:Conditions NotBefore="${notBefore.toISOString()}" NotOnOrAfter="${notOnOrAfter.toISOString()}"><saml:AudienceRestriction><saml:Audience>${xmlEscape(audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions>`;
  const authnStatement = `<saml:AuthnStatement AuthnInstant="${now.toISOString()}" SessionIndex="${xmlEscape(sessionIndex)}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>`;

  let assertionXml =
    `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" Version="2.0" IssueInstant="${now.toISOString()}">` +
    `<saml:Issuer>${xmlEscape(issuer)}</saml:Issuer>` +
    `${subject}${conditions}${authnStatement}${attributeStatement}` +
    `</saml:Assertion>`;

  if (!options.omitSignature) {
    const sig = new SignedXml({
      privateKey: IDP_KEY,
      signatureAlgorithm:
        (options.signatureAlgorithm ?? "sha256") === "sha1"
          ? "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
          : "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
      canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
    });
    sig.addReference({
      xpath: `//*[local-name(.)='Assertion' and @ID='${assertionId}']`,
      transforms: [
        "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
        "http://www.w3.org/2001/10/xml-exc-c14n#",
      ],
      digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    });
    sig.computeSignature(assertionXml, {
      location: {
        reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']",
        action: "after",
      },
    });
    assertionXml = sig.getSignedXml();
  }

  const response =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${responseId}" Version="2.0" IssueInstant="${now.toISOString()}" Destination="${xmlEscape(destination)}" InResponseTo="${xmlEscape(options.inResponseTo)}">` +
    `<saml:Issuer>${xmlEscape(issuer)}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `${assertionXml}` +
    `</samlp:Response>`;

  return Buffer.from(response, "utf8").toString("base64");
}

/** Decodes a built SAMLResponse, replaces a literal substring inside the already-signed
 * content, and re-encodes it — used to prove a tampered assertion fails signature validation. */
export function tamperSignedResponse(
  samlResponseBase64: string,
  search: string,
  replacement: string,
): string {
  const xml = Buffer.from(samlResponseBase64, "base64").toString("utf8");
  if (!xml.includes(search)) {
    throw new Error(
      `tamperSignedResponse: "${search}" not found in fixture XML`,
    );
  }
  return Buffer.from(xml.replace(search, replacement), "utf8").toString(
    "base64",
  );
}
