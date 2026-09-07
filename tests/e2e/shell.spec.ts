import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readSeededPassword, login } from "./support/demo-accounts";

/**
 * UI_UX_SPEC.md §3's application shell, exercised for all three roles —
 * Phase 6's exit criterion. Demo account setup lives in
 * ./support/demo-accounts.ts, shared with dashboard.spec.ts.
 */

async function navLabels(page: Page): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: "Primary" });
  return nav.getByRole("link").allTextContents();
}

test.describe("Application shell", () => {
  // Serial: keeps this file's own tests predictable to read even though
  // the password race that originally motivated this is now handled once,
  // globally, by support/global-setup.ts.
  test.describe.configure({ mode: "serial" });

  const password = readSeededPassword();

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
