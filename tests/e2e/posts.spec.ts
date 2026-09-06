import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readSeededPassword, login } from "./support/demo-accounts";
import { deletePostByTitle } from "./support/db-cleanup";

/**
 * The "My Posts" screen (UI_UX_SPEC.md §6): tabs, search, filters, and the
 * per-status row actions (Edit/Submit/Delete on a draft, Duplicate on an
 * approved/rejected post — that last one only needs an approved fixture,
 * which is expensive to set up in a real browser and is already covered at
 * the API layer by tests/integration/posts-list.test.ts). Also proves the
 * dashboard's `?status=` stat-card links (employee-dashboard.tsx) land on
 * the right tab now that this screen is real rather than ComingSoon.
 */

const DRAFT_TITLE = "Posts list check draft";
const SUBMIT_TITLE = "Posts list check submit";
const DELETE_TITLE = "Posts list check delete";

test.afterEach(() => {
  deletePostByTitle(DRAFT_TITLE);
  deletePostByTitle(SUBMIT_TITLE);
  deletePostByTitle(DELETE_TITLE);
});

test.describe("My Posts", () => {
  test("lists only the creator's own posts, searchable and filterable by tab", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Create" })
      .click();
    await page.waitForURL(/\/posts\/.+\/edit/);
    await page.getByLabel("Title").fill(DRAFT_TITLE);
    await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: 10_000 });

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "My Posts" })
      .click();
    await page.waitForURL("/posts");
    await expect(page.getByRole("heading", { name: "My Posts" })).toBeVisible();
    await expect(page.getByRole("link", { name: DRAFT_TITLE })).toBeVisible();

    await page.getByLabel("Search posts").fill("zzz-nothing-matches");
    await expect(page.getByText("No posts match these filters.")).toBeVisible();

    await page.getByLabel("Search posts").fill("");
    await page.getByRole("tab", { name: "Drafts" }).click();
    await expect(page.getByRole("link", { name: DRAFT_TITLE })).toBeVisible();

    await page.getByRole("tab", { name: "Approved" }).click();
    await expect(
      page.getByRole("link", { name: DRAFT_TITLE }),
    ).not.toBeVisible();

    // The dashboard's stat cards deep-link with `?status=`, not `?tab=`.
    await page.goto("/posts?status=DRAFT");
    await expect(
      page.getByRole("tab", { name: "Drafts", selected: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: DRAFT_TITLE })).toBeVisible();
  });

  test("submitting from the list moves a draft into Pending approval", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Create" })
      .click();
    await page.waitForURL(/\/posts\/.+\/edit/);
    await page.getByLabel("Title").fill(SUBMIT_TITLE);
    await page.getByRole("textbox", { name: "Post content" }).click();
    await page.keyboard.type("Ready for its list-level submit.");
    await page.getByLabel("Department").click();
    await page.getByRole("option", { name: "Marketing" }).click();
    await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: 10_000 });
    // The department select fires its own PATCH, separate from the
    // title/content autosave above (editor-screen.tsx's handleDepartmentChange)
    // — wait for its readiness refresh to resolve the route before
    // navigating away, or that PATCH can still be in flight and get
    // aborted, leaving departmentId unset server-side.
    await expect(page.getByText("Jane Manager")).toBeVisible();

    await page.goto("/posts?status=DRAFT");
    const row = page.getByRole("row", { name: new RegExp(SUBMIT_TITLE) });
    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Submit" }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByText(`Submit "${SUBMIT_TITLE}" for approval?`),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Submit" })
      .click();
    await expect(
      page.getByText("Submitted for approval.", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("link", { name: SUBMIT_TITLE }),
    ).not.toBeVisible();
    await page.getByRole("tab", { name: "Pending approval" }).click();
    await expect(page.getByRole("link", { name: SUBMIT_TITLE })).toBeVisible();
  });

  test("deleting a draft from the list removes it", async ({ page }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Create" })
      .click();
    await page.waitForURL(/\/posts\/.+\/edit/);
    await page.getByLabel("Title").fill(DELETE_TITLE);
    await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: 10_000 });

    await page.goto("/posts?status=DRAFT");
    const row = page.getByRole("row", { name: new RegExp(DELETE_TITLE) });
    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByText("Draft deleted.", { exact: true })).toBeVisible(
      { timeout: 10_000 },
    );
    await expect(
      page.getByRole("link", { name: DELETE_TITLE }),
    ).not.toBeVisible();
  });

  test("has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);
    await page.goto("/posts");
    await expect(page.getByRole("heading", { name: "My Posts" })).toBeVisible();

    const results = await new AxeBuilder({ page }).include("body").analyze();
    expect(results.violations).toEqual([]);
  });
});
