import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readSeededPassword, login } from "./support/demo-accounts";

/**
 * Phase 10 — the Post Details screen against the seeded hero fixture
 * (DATABASE.md §10): "Introducing Kron PAM 4.0", IN_REVIEW at version 3,
 * with a REQUEST_CHANGES comment on version 2 and two attachments.
 */

test.describe("Post Details", () => {
  test("shows the Overview tab, and Versions tab lets you compare two versions", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);

    await page.goto("/dashboard");
    await page
      .getByText(/Jane Manager\s+started reviewing/)
      .first()
      .getByRole("link", { name: "Introducing Kron PAM 4.0" })
      .click();
    await page.waitForURL(/\/posts\/[0-9a-f-]+$/);

    await expect(
      page.getByRole("heading", { name: "Introducing Kron PAM 4.0" }),
    ).toBeVisible();
    await expect(page.getByText("IN REVIEW", { exact: false })).toBeVisible();
    await expect(page.getByText("Current version").locator("..")).toContainText(
      "3",
    );

    await page.getByRole("tab", { name: "Versions" }).click();
    const versionsPanel = page.getByRole("tabpanel", { name: "Versions" });
    const versionList = versionsPanel.getByRole("list");
    await expect(versionList.getByText("Version 3")).toBeVisible();
    await expect(versionList.getByText("Version 2")).toBeVisible();
    await expect(versionList.getByText("Version 1")).toBeVisible();

    // Default comparison is previous → current (2 → 3); the legend and
    // diff body render without an explicit selection.
    await expect(
      page.getByText("colour is never the only signal"),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Approval history" }).click();
    await expect(
      page.getByText(/requested changes on version 2/),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByText("submitted version 3", { exact: true }),
    ).toBeVisible();
  });

  test("has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);
    await page.goto("/dashboard");
    await page
      .getByText(/Jane Manager\s+started reviewing/)
      .first()
      .getByRole("link", { name: "Introducing Kron PAM 4.0" })
      .click();
    await page.waitForURL(/\/posts\/[0-9a-f-]+$/);

    const results = await new AxeBuilder({ page }).include("body").analyze();
    expect(results.violations).toEqual([]);
  });
});
