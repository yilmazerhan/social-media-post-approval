import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readSeededPassword, login } from "./support/demo-accounts";
import { deletePostByTitle } from "./support/db-cleanup";

/**
 * Phase 16 — notifications. Submitting a post fires a real notification to
 * its approver (bell badge + dropdown + full /notifications page), and
 * deciding it fires one back to the creator; marking read/mark-all-read
 * clears the badge. Uses a fresh, disposable post — never the shared hero
 * fixture other specs pin to.
 */

const TITLE = "Notifications flow check post";

test.afterEach(() => {
  deletePostByTitle(TITLE);
});

test.describe("Notifications", () => {
  test("notifies the approver on submit, and the creator on approval", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Create" })
      .click();
    await page.waitForURL(/\/posts\/.+\/edit/);
    await page.getByLabel("Title").fill(TITLE);
    await page.getByRole("textbox", { name: "Post content" }).click();
    await page.keyboard.type("Body for the notifications flow check.");
    await page.getByLabel("Department").click();
    await page.getByRole("option", { name: "Marketing" }).click();
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();
    await page.getByRole("button", { name: "Submit" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Submit" })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Your post has been submitted for approval.",
      }),
    ).toBeVisible();

    await login(page, "jane.manager@example.local", password);

    const bell = page.getByRole("button", { name: /Notifications/ });
    await expect(bell).toContainText(/\d/);
    await bell.click();
    await expect(page.getByText(`Approval needed: ${TITLE}`)).toBeVisible();

    await page.goto("/notifications");
    await expect(page.getByText(`Approval needed: ${TITLE}`)).toBeVisible();
    await page.getByText(`Approval needed: ${TITLE}`).click();
    await page.waitForURL(/\/approvals\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(
      page.getByRole("heading", { name: /Approve version 1 of/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("APPROVED")).toBeVisible();

    await login(page, "john.doe@example.local", password);
    await page.goto("/notifications");
    await expect(page.getByText(`Approved: ${TITLE}`)).toBeVisible();
    await page.getByRole("tab", { name: "Unread" }).click();
    await expect(page.getByText(`Approved: ${TITLE}`)).toBeVisible();
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(page.getByText("No notifications here.")).toBeVisible();
  });

  test("has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);
    await page.goto("/notifications");
    await expect(
      page.getByRole("heading", { name: "Notifications" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).include("body").analyze();
    expect(results.violations).toEqual([]);
  });
});
