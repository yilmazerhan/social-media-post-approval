import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CONFIGURATION.md §10 / IMPLEMENTATION_PLAN.md Phase 2 exit criterion:
 * the process must refuse to start with a readable error when required
 * configuration is missing, and must boot when it is complete. Run as a
 * real subprocess because config.ts calls process.exit() on failure.
 */
const configEntry = path.resolve(__dirname, "../../src/server/config.ts");
const tsxBin = path.resolve(__dirname, "../../node_modules/.bin/tsx");

const VALID_ENV = {
  PATH: process.env.PATH ?? "",
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL:
    "postgresql://ca:ca_dev_password@localhost:5432/content_approval_test",
  SESSION_SECRET: "a".repeat(32),
  SMTP_HOST: "localhost",
  SMTP_FROM: "no-reply@example.local",
};

function runConfig(env: Record<string, string | undefined>) {
  return spawnSync(tsxBin, [configEntry], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
}

describe("fail-fast configuration", () => {
  it("exits non-zero with a readable message when SESSION_SECRET is missing", () => {
    const envWithoutSecret = { ...VALID_ENV, SESSION_SECRET: undefined };
    const result = runConfig(envWithoutSecret);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Invalid configuration");
    expect(result.stderr).toContain("SESSION_SECRET");
  });

  it("exits non-zero when APP_URL is missing", () => {
    const envWithoutUrl = { ...VALID_ENV, APP_URL: undefined };
    const result = runConfig(envWithoutUrl);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("APP_URL");
  });

  it("boots successfully with a complete environment and never prints the secret", () => {
    const result = runConfig(VALID_ENV);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Configuration loaded");
    expect(result.stderr).not.toContain(VALID_ENV.SESSION_SECRET);
    expect(result.stderr).not.toContain(VALID_ENV.DATABASE_URL);
  });

  it("rejects a production SESSION_SECRET that looks like a placeholder", () => {
    const result = runConfig({
      ...VALID_ENV,
      NODE_ENV: "production",
      SESSION_SECRET: "changeme-changeme-changeme-changeme-1234",
      COOKIE_SECURE: "true",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("placeholder");
  });

  it("requires SAML fields when AUTH_SAML_ENABLED=true", () => {
    const result = runConfig({ ...VALID_ENV, AUTH_SAML_ENABLED: "true" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SAML_ENTITY_ID");
  });
});
