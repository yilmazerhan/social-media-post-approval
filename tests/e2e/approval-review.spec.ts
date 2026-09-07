import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readSeededPassword, login } from "./support/demo-accounts";
import { deletePostByTitle } from "./support/db-cleanup";

/**
 * Phase 14 — Approval Review (hero screen B). Read-only assertions (the
 * five-second header, the diff tab) run against the seeded hero fixture
 * (DATABASE.md §10) the same way tests/e2e/post-details.spec.ts and
 * approval-queue.spec.ts already do. Every test that actually *decides*
 * a post creates and submits its own disposable one first — approving or
 * rejecting the shared hero fixture would corrupt the exact `IN_REVIEW`
 * state those other specs pin to, in the same shared dev database.
 */

const CREATED_TITLES = [
  "Review flow approve check post",
  "Review flow request-changes check post",
  "Review flow mobile check post",
];

test.afterEach(() => {
  for (const title of CREATED_TITLES) {
    deletePostByTitle(title);
  }
});

async function createAndSubmit(
  page: import("@playwright/test").Page,
  title: string,
) {
  const password = readSeededPassword();
  await login(page, "john.doe@example.local", password);

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Create" })
    .click();
  await page.waitForURL(/\/posts\/.+\/edit/);

  await page.getByLabel("Title").fill(title);
  await page.getByRole("textbox", { name: "Post content" }).click();
  await page.keyboard.type("Original body for the review flow check.");
  await page.getByLabel("Department").click();
  await page.getByRole("option", { name: "Marketing" }).click();
  await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();
  await page.getByRole("button", { name: "Submit" }).click();
  const submitDialog = page.getByRole("dialog");
  await submitDialog.getByRole("button", { name: "Submit" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your post has been submitted for approval.",
    }),
  ).toBeVisible();
}

test.describe("Approval Review", () => {
  test("shows the five-second header and the diff on the seeded fixture", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "jane.manager@example.local", password);

    await page.goto("/approvals");
    await page.getByRole("link", { name: "Introducing Kron PAM 4.0" }).click();
    await page.waitForURL(/\/approvals\/[0-9a-f-]+$/);

    await expect(
      page.getByRole("heading", { name: "Introducing Kron PAM 4.0" }),
    ).toBeVisible();
    await expect(page.getByText("IN REVIEW", { exact: false })).toBeVisible();

    await expect(
      page.getByRole("tab", { name: /Compare v2 → v3/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /Compare v2 → v3/ }).click();
    await expect(
      page.getByText("colour is never the only signal"),
    ).toBeVisible();
  });

  test("approves a post without leaving the page", async ({ page }) => {
    await createAndSubmit(page, "Review flow approve check post");

    const password = readSeededPassword();
    await login(page, "jane.manager@example.local", password);
    await page.goto("/approvals");
    await page
      .getByRole("link", { name: "Review flow approve check post" })
      .click();
    await page.waitForURL(/\/approvals\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(
      page.getByRole("heading", { name: /Approve version 1 of/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText("APPROVED")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next in queue" }),
    ).toBeVisible();
  });

  test("requires a comment to request changes", async ({ page }) => {
    await createAndSubmit(page, "Review flow request-changes check post");

    const password = readSeededPassword();
    await login(page, "jane.manager@example.local", password);
    await page.goto("/approvals");
    await page
      .getByRole("link", { name: "Review flow request-changes check post" })
      .click();
    await page.waitForURL(/\/approvals\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: "Request changes" }).click();
    await expect(
      page.getByText("A comment is required to request changes.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Request changes on version/ }),
    ).not.toBeVisible();

    await page
      .getByLabel("Comment (required for changes and rejection)")
      .fill("Tighten the CTA copy.");
    await page.getByRole("button", { name: "Request changes" }).click();
    await expect(
      page.getByRole("heading", { name: /Request changes on version 1/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("CHANGES REQUESTED")).toBeVisible();
  });

  test("shows the mobile bottom-sheet decision flow", async ({ page }) => {
    await createAndSubmit(page, "Review flow mobile check post");

    await page.setViewportSize({ width: 390, height: 844 });
    const password = readSeededPassword();
    await login(page, "jane.manager@example.local", password);
    await page.goto("/approvals");
    await page
      .getByRole("link", { name: "Review flow mobile check post" })
      .click();
    await page.waitForURL(/\/approvals\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: "Decide" }).click();
    await expect(page.getByRole("heading", { name: "Decision" })).toBeVisible();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(
      page.getByText("A reason is required to reject.", { exact: true }),
    ).toBeVisible();
  });

  test("has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "jane.manager@example.local", password);
    await page.goto("/approvals");
    await page.getByRole("link", { name: "Introducing Kron PAM 4.0" }).click();
    await page.waitForURL(/\/approvals\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name: "Introducing Kron PAM 4.0" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).include("body").analyze();
    expect(results.violations).toEqual([]);
  });
});
