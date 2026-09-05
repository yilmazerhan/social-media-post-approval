import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readSeededPassword, login } from "./support/demo-accounts";

/**
 * Phase 13 — the Approval Queue screen against the seeded hero fixture
 * (DATABASE.md §10): Jane Manager has an open, `IN_PROGRESS` assignment
 * on "Introducing Kron PAM 4.0" (version 3, `IN_REVIEW`).
 */

test.describe("Approval Queue", () => {
  test("shows the approver's own open assignments, filterable by priority", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "jane.manager@example.local", password);

    await page.goto("/approvals");
    await expect(
      page.getByRole("heading", { name: "Approvals" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Introducing Kron PAM 4.0" }),
    ).toBeVisible();

    // A priority that can't match the fixture empties the table without
    // erroring — proves the filter round-trips through the API.
    await page.getByLabel("Filter by priority").click();
    await page.getByRole("option", { name: "Low" }).click();
    await expect(
      page.getByText("Nothing in your queue right now."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(
      page.getByRole("link", { name: "Introducing Kron PAM 4.0" }),
    ).toBeVisible();
  });

  test("an employee without APPROVAL_READ is redirected away from the queue", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);

    await page.goto("/approvals");
    await page.waitForURL("/dashboard");
  });

  test("has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "jane.manager@example.local", password);
    await page.goto("/approvals");
    await expect(
      page.getByRole("link", { name: "Introducing Kron PAM 4.0" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).include("body").analyze();
    expect(results.violations).toEqual([]);
  });
});
