import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

/**
 * Shared by every e2e spec that logs in as a seeded demo account.
 * `db:seed` and the login-attempt reset run via `tsx` subprocesses rather
 * than importing `@/server/db` directly — Playwright's own module loader
 * can't handle the generated Prisma client's ESM output the way
 * tsx/Next/vitest do (see tests/integration/seed-idempotency.test.ts for
 * the same constraint on the integration side).
 */

const tsxBin = path.resolve(__dirname, "../../../node_modules/.bin/tsx");
const seedEntry = path.resolve(__dirname, "../../../prisma/seed.ts");
const resetLoginAttemptsEntry = path.resolve(
  __dirname,
  "../../../prisma/reset-demo-login-attempts.ts",
);

/** Written once by global-setup.ts, read by every spec file's beforeAll. */
export const PASSWORD_FILE = path.resolve(
  __dirname,
  "../../../test-results/.demo-password.json",
);

export function readSeededPassword(): string {
  const contents = readFileSync(PASSWORD_FILE, "utf8");
  return (JSON.parse(contents) as { password: string }).password;
}

export function seedDemoAccounts(): string {
  const result = spawnSync(tsxBin, [seedEntry], {
    env: process.env,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.status !== 0) {
    throw new Error(`db:seed failed: ${result.stderr}`);
  }
  const match = result.stdout.match(/password:\s+(\S+)/);
  if (!match) throw new Error("db:seed did not print a demo password");
  return match[1];
}

/** Repeated logins across local test runs would otherwise trip RATE_LIMIT_AUTH_MAX for real. */
export function resetLoginAttempts(): void {
  const result = spawnSync(tsxBin, [resetLoginAttemptsEntry], {
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(`reset-demo-login-attempts failed: ${result.stderr}`);
  }
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
}
