import { test, expect } from "@playwright/test";
import { readSeededPassword, login } from "./support/demo-accounts";
import { deletePostByTitle } from "./support/db-cleanup";

/**
 * Phase 15 — threaded comments and server-side mention parsing, driven
 * through the real Post Details screen against a fresh, disposable post
 * (never the shared hero fixture other specs pin to).
 */

const TITLE = "Comments flow check post";

test.afterEach(() => {
  deletePostByTitle(TITLE);
});

test.describe("Comments", () => {
  test("mentions a colleague, who sees the highlighted mention and replies", async ({
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
    await page.keyboard.type("Body for the comments flow check.");
    await page.getByLabel("Department").click();
    await page.getByRole("option", { name: "Marketing" }).click();
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();
    await page.getByRole("button", { name: "Submit" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Submit" })
      .click();
    await page.getByRole("link", { name: "View post" }).click();
    await page.waitForURL(/\/posts\/[0-9a-f-]+$/);

    await page.getByRole("tab", { name: "Comments" }).click();
    await page
      .getByLabel("Write a comment… type @ to mention someone")
      .fill("Hey @Jane");
    await expect(
      page.getByRole("button", { name: "Jane Manager" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Jane Manager" }).click();
    await page
      .getByLabel("Write a comment… type @ to mention someone")
      .press("End");
    await page.keyboard.type("please take a look.");
    await page.getByRole("button", { name: "Post", exact: true }).click();

    await expect(
      page.locator(".mention", { hasText: "@Jane Manager" }),
    ).toBeVisible();

    const postUrl = page.url();
    await login(page, "jane.manager@example.local", password);
    await page.goto(postUrl);
    await page.getByRole("tab", { name: "Comments" }).click();
    await expect(page.getByText("please take a look.")).toBeVisible();

    const commentItem = page
      .getByRole("listitem")
      .filter({ hasText: "please take a look." });
    await commentItem.getByRole("button", { name: "Reply" }).click();
    await commentItem.getByLabel("Write a reply…").fill("On it, thanks!");
    await commentItem
      .getByRole("button", { name: "Post", exact: true })
      .click();
    await expect(page.getByText("On it, thanks!")).toBeVisible();
  });
});
