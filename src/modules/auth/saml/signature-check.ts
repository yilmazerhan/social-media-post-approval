/**
 * node-saml (via xml-crypto) cryptographically verifies the assertion's
 * signature but trusts whatever algorithm the document itself declares.
 * AUTHENTICATION.md §3 requires SHA-256 or stronger, so we additionally
 * veto SHA-1 ourselves once the signature has already been proven valid
 * — this only narrows what a validly-signed assertion is allowed to use,
 * it never widens trust.
 */
const WEAK_SIGNATURE_PATTERN =
  /<(?:[a-zA-Z0-9]+:)?SignatureMethod\b[^>]*Algorithm="[^"]*#(?:rsa-sha1|dsa-sha1)"/i;

export function usesWeakSignatureAlgorithm(assertionXml: string): boolean {
  return WEAK_SIGNATURE_PATTERN.test(assertionXml);
}

export function extractAssertionId(assertionXml: string): string | null {
  const match = assertionXml.match(
    /<(?:[a-zA-Z0-9]+:)?Assertion\b[^>]*\bID="([^"]+)"/,
  );
  return match?.[1] ?? null;
}

export function extractNotOnOrAfter(assertionXml: string): Date | null {
  const match = assertionXml.match(/NotOnOrAfter="([^"]+)"/);
  if (!match) return null;
  const date = new Date(match[1]);
  return Number.isNaN(date.getTime()) ? null : date;
}
