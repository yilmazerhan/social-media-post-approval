import { test, expect, type Page } from "@playwright/test";
import { readSeededPassword, login } from "./support/demo-accounts";

/**
 * Phase 22 — Reports. Read-only against the seeded hero-post fixture
 * (DATABASE.md §10): one SUBMIT and two REQUEST_CHANGES actions (v2/v3 use
 * RESUBMIT, not SUBMIT), and two COMPLETED assignments for Jane Manager —
 * all within the default 30-day filter window. Never decided (still
 * IN_REVIEW), so by-department/by-creator stay empty; by-approver, which
 * keys off completed assignments rather than decided posts, does not. This
 * spec creates no fixture rows of its own and needs no cleanup.
 */

/** The report card (a `Card`) whose title includes `title` — every `ReportCard` sets `data-slot="card"`. */
function reportCard(page: Page, title: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: title }).first();
}

/** The `StatCard` tile (itself a nested `Card`) labelled `label`, inside a report card. */
function statTile(card: ReturnType<typeof reportCard>, label: string) {
  return card.locator('[data-slot="card"]').filter({ hasText: label });
}

test.describe("Reports", () => {
  test("an admin sees real report data across report shapes and exports a CSV", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "admin@example.local", password);

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

    const summaryCard = reportCard(page, "Volume by decision");
    await expect(summaryCard).toBeVisible();
    await expect(
      statTile(summaryCard, "Submitted").getByText("1", { exact: true }),
    ).toBeVisible();
    await expect(
      statTile(summaryCard, "Changes requested").getByText("2", {
        exact: true,
      }),
    ).toBeVisible();

    const throughputCard = reportCard(page, "Volume over time");
    await expect(throughputCard).toBeVisible();
    await expect(throughputCard.getByRole("table")).toBeVisible();
    // A header row plus at least one data row for the hero fixture's submission.
    expect(await throughputCard.getByRole("row").count()).toBeGreaterThan(1);

    const byApproverCard = reportCard(page, "Volume by approver");
    await expect(
      byApproverCard.getByRole("row", { name: "Jane Manager 2 180" }),
    ).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      summaryCard.getByRole("link", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("summary.csv");
  });
});
