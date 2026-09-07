// Fallback SAML test configuration — applied only when nothing has already
// set it (a developer's own .env.test, which is gitignored like .env
// itself, always wins). Without this, a bare clone's `npm test` would run
// with AUTH_SAML_ENABLED=false and every test in
// tests/integration/saml-acs.test.ts would fail outright, since that
// suite's whole point is exercising the real SAML config path. The values
// here must match tests/fixtures/saml/build-response.ts's defaults, and
// the certificate is the committed, throwaway test-IdP fixture.
if (!process.env.SAML_ENTITY_ID) {
  process.env.AUTH_SAML_ENABLED = "true";
  process.env.SAML_ENTITY_ID = "https://approval.test.local/saml";
  process.env.SAML_IDP_ENTITY_ID = "https://test-idp.example.local/metadata";
  process.env.SAML_IDP_SSO_URL = "https://test-idp.example.local/sso";
  process.env.SAML_IDP_CERTIFICATE_FILE = "./tests/fixtures/saml/idp-cert.pem";
  process.env.SAML_WANT_ASSERTIONS_SIGNED = "true";
  process.env.SAML_WANT_RESPONSE_SIGNED = "false";
}

import "@testing-library/jest-dom/vitest";
