import { spawnSync } from "node:child_process";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * UI_UX_SPEC.md §3's application shell, exercised for all three roles —
 * Phase 6's exit criterion. Demo accounts come from `db:seed` (their
 * password is regenerated per run and only ever printed to stdout, so this
 * spawns it once and parses the password out, exactly like
 * tests/integration/seed-idempotency.test.ts does for the same reason).
 * Both scripts run via tsx as subprocesses rather than importing
 * @/server/db directly — Playwright's own module loader can't handle the
 * generated Prisma client's ESM output the way tsx/Next/vitest do.
 */

const tsxBin = path.resolve(__dirname, "../../node_modules/.bin/tsx");
const seedEntry = path.resolve(__dirname, "../../prisma/seed.ts");
const resetLoginAttemptsEntry = path.resolve(
  __dirname,
  "../../prisma/reset-demo-login-attempts.ts",
);

function seedDemoAccounts(): string {
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

/** This suite logs in as the demo accounts repeatedly across runs while
 * iterating locally; without this they'd eventually trip
 * RATE_LIMIT_AUTH_MAX for real, same as any other repeated-login pattern. */
function resetLoginAttempts(): void {
  const result = spawnSync(tsxBin, [resetLoginAttemptsEntry], {
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(`reset-demo-login-attempts failed: ${result.stderr}`);
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
}

async function navLabels(page: Page): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: "Primary" });
  return nav.getByRole("link").allTextContents();
}

test.describe("Application shell", () => {
  // Serial: every test shares the same seeded demo accounts, and db:seed
  // resets their password each run — parallel workers would each reseed
  // and invalidate the password other workers already read.
  test.describe.configure({ mode: "serial" });

  let password: string;

  test.beforeAll(() => {
    password = seedDemoAccounts();
    resetLoginAttempts();
  });

  test("EMPLOYEE sees only their own-content navigation", async ({ page }) => {
    await login(page, "john.doe@example.local", password);
    const labels = await navLabels(page);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Dashboard",
        "My Posts",
        "Create",
        "Notifications",
      ]),
    );
    expect(labels).not.toContain("Approvals");
    expect(labels).not.toContain("Reports");
    expect(labels).not.toContain("Administration");
  });

  test("APPROVER additionally sees Approvals and Reports, not Administration", async ({
    page,
  }) => {
    await login(page, "jane.manager@example.local", password);
    const labels = await navLabels(page);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Dashboard",
        "My Posts",
        "Create",
        "Approvals",
        "Notifications",
        "Reports",
      ]),
    );
    expect(labels).not.toContain("Administration");
  });

  test("ADMIN sees every navigation item", async ({ page }) => {
    await login(page, "admin@example.local", password);
    const labels = await navLabels(page);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Dashboard",
        "My Posts",
        "Create",
        "Approvals",
        "Notifications",
        "Reports",
        "Administration",
      ]),
    );
  });

  test("the shell has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await login(page, "admin@example.local", password);
    const results = await new AxeBuilder({ page }).include("body").analyze();
    expect(results.violations).toEqual([]);
  });

  test("desktop (>=1280px): the sidebar is persistent, not a drawer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, "admin@example.local", password);
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeHidden();
  });

  test("1024-1279px: navigation is still reachable", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await login(page, "admin@example.local", password);
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  });

  test("tablet (768-1023px): the sidebar becomes a slide-over drawer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await login(page, "admin@example.local", password);
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeHidden();
    const menuButton = page.getByRole("button", { name: "Open navigation" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  });

  test("mobile (<768px): the sidebar becomes a slide-over drawer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await login(page, "admin@example.local", password);
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeHidden();
    const menuButton = page.getByRole("button", { name: "Open navigation" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  });
});
