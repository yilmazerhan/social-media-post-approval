import { describe, expect, it } from "vitest";
import {
  extractAssertionId,
  extractNotOnOrAfter,
  usesWeakSignatureAlgorithm,
} from "@/modules/auth/saml/signature-check";

describe("usesWeakSignatureAlgorithm", () => {
  it("flags rsa-sha1", () => {
    const xml =
      '<Signature><SignedInfo><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/></SignedInfo></Signature>';
    expect(usesWeakSignatureAlgorithm(xml)).toBe(true);
  });

  it("flags dsa-sha1", () => {
    const xml =
      '<Signature><SignedInfo><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#dsa-sha1"/></SignedInfo></Signature>';
    expect(usesWeakSignatureAlgorithm(xml)).toBe(true);
  });

  it("does not flag rsa-sha256", () => {
    const xml =
      '<Signature><SignedInfo><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/></SignedInfo></Signature>';
    expect(usesWeakSignatureAlgorithm(xml)).toBe(false);
  });
});

describe("extractAssertionId", () => {
  it("reads the ID attribute off the Assertion element", () => {
    const xml =
      '<saml:Assertion ID="_abc123" Version="2.0">...</saml:Assertion>';
    expect(extractAssertionId(xml)).toBe("_abc123");
  });

  it("returns null when no Assertion ID is present", () => {
    // A validly-signed assertion always carries an ID (xml-crypto's
    // Reference/@ID pair requires it), so this can't be produced by a
    // real signed response — this guards the MISSING_ASSERTION_ID branch
    // in acs.ts as defense in depth. See tests/integration/saml-acs.test.ts.
    const xml = '<saml:Assertion Version="2.0">...</saml:Assertion>';
    expect(extractAssertionId(xml)).toBeNull();
  });
});

describe("extractNotOnOrAfter", () => {
  it("parses the NotOnOrAfter attribute", () => {
    const xml = '<saml:Conditions NotOnOrAfter="2026-01-01T00:00:00.000Z"/>';
    expect(extractNotOnOrAfter(xml)?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("returns null when absent", () => {
    expect(extractNotOnOrAfter("<saml:Conditions/>")).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(
      extractNotOnOrAfter('<saml:Conditions NotOnOrAfter="not-a-date"/>'),
    ).toBeNull();
  });
});
