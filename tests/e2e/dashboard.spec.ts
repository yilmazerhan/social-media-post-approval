import { test, expect, type Page } from "@playwright/test";
import { readSeededPassword, login } from "./support/demo-accounts";

/** The card (or health tile) whose text includes `label` — every Card sets `data-slot="card"`. */
function cardWithText(page: Page, label: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: label });
}

/**
 * Phase 7's exit criterion: each role sees its own dashboard and its
 * counts match the database. These assertions are pinned to the exact
 * hero-post fixture `db:seed` creates (DATABASE.md §10) — one post,
 * IN_REVIEW, with two COMPLETED assignments (no due date) and one open
 * IN_PROGRESS assignment due in 6h with its warning already elapsed.
 */

test.describe("Dashboard", () => {
  const password = readSeededPassword();

  test("EMPLOYEE sees their own post counts and recent activity", async ({
    page,
  }) => {
    await login(page, "john.doe@example.local", password);

    await expect(page.getByText("Drafts")).toBeVisible();
    await expect(
      cardWithText(page, "Pending approval").getByText("1", { exact: true }),
    ).toBeVisible();

    await expect(page.getByText("Recent activity")).toBeVisible();
    // The seed fixture's hero post has three START_REVIEW actions by Jane
    // (one per version); the most recent is what belongs at the top.
    await expect(
      page.getByText(/Jane Manager\s+started reviewing/).first(),
    ).toBeVisible();
  });

  test("APPROVER sees their queue counts and SLA compliance", async ({
    page,
  }) => {
    await login(page, "jane.manager@example.local", password);

    await expect(
      cardWithText(page, "Pending approvals").getByText("1", { exact: true }),
    ).toBeVisible();
    await expect(
      cardWithText(page, "Due soon").getByText("1", { exact: true }),
    ).toBeVisible();

    await expect(page.getByText("SLA compliance (last 30 days)")).toBeVisible();
    await expect(
      page.getByText("No decisions with a due date in the last 30 days yet."),
    ).toBeVisible();
  });

  test("ADMIN sees system-wide counts and health tiles", async ({ page }) => {
    await login(page, "admin@example.local", password);

    await expect(
      cardWithText(page, "Total users").getByText("3", { exact: true }),
    ).toBeVisible();
    await expect(
      cardWithText(page, "Active users").getByText("3", { exact: true }),
    ).toBeVisible();

    await expect(
      page.getByText("3 posts submitted in the last 14 days."),
    ).toBeVisible();
    await expect(page.getByText("3h 0m")).toBeVisible();

    await expect(page.getByText("System health")).toBeVisible();
    await expect(page.getByText("Healthy")).toHaveCount(4);
  });
});
