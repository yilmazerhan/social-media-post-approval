import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

/** SECURITY.md §3 — headers/CSP asserted by the application's own middleware. */
describe("security headers middleware", () => {
  it("sets every required header, a CSP with a nonce, and a matching form-action when SAML is disabled", () => {
    const request = new NextRequest("http://localhost:3000/login");
    const response = middleware(request);

    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'/);
    expect(csp).toMatch(/style-src 'self' 'nonce-[^']+'/);
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");

    expect(response.headers.get("Strict-Transport-Security")).toMatch(
      /max-age=63072000/,
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin",
    );
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "same-origin",
    );
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("generates a different nonce on every request", () => {
    const nonceOf = (response: ReturnType<typeof middleware>) =>
      response.headers
        .get("Content-Security-Policy")
        ?.match(/nonce-([^']+)/)?.[1];

    const first = nonceOf(
      middleware(new NextRequest("http://localhost:3000/login")),
    );
    const second = nonceOf(
      middleware(new NextRequest("http://localhost:3000/login")),
    );
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("adds the SAML IdP origin to form-action only when SAML is enabled", () => {
    const original = {
      enabled: process.env.AUTH_SAML_ENABLED,
      sso: process.env.SAML_IDP_SSO_URL,
    };
    process.env.AUTH_SAML_ENABLED = "true";
    process.env.SAML_IDP_SSO_URL = "https://idp.example.local/sso";
    try {
      const response = middleware(
        new NextRequest("http://localhost:3000/login"),
      );
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain("form-action 'self' https://idp.example.local");
    } finally {
      process.env.AUTH_SAML_ENABLED = original.enabled;
      process.env.SAML_IDP_SSO_URL = original.sso;
    }
  });
});
