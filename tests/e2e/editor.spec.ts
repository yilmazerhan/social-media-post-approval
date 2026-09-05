import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { readSeededPassword, login } from "./support/demo-accounts";
import { deletePostByTitle } from "./support/db-cleanup";

/**
 * UI_UX_SPEC.md §4's Post Editor — the CREATE → PREVIEW → VALIDATE →
 * SUBMIT flow, exercised end to end in a real browser against the
 * seeded "Marketing content" approval rule (department: Marketing,
 * approver: Jane Manager). Every post this suite creates is deleted in
 * `afterEach` by its distinctive title — this runs against the real dev
 * database, and a submitted post changes counts
 * tests/e2e/dashboard.spec.ts pins to the seeded fixture alone.
 */

const CREATED_TITLES = [
  "Launching the new dashboard",
  "Accessibility check post",
  "Mobile editor check post",
  "Media upload check post",
];

test.afterEach(() => {
  for (const title of CREATED_TITLES) {
    deletePostByTitle(title);
  }
});

test.describe("Post Editor", () => {
  test("create, type, autosave, validate and submit a post", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Create" })
      .click();
    await page.waitForURL(/\/posts\/.+\/edit/);

    await page.getByLabel("Title").fill("Launching the new dashboard");
    await page.getByRole("textbox", { name: "Post content" }).click();
    await page.keyboard.type(
      "We are thrilled to announce the new dashboard experience.",
    );

    // Autosave fires on a 3s idle debounce (AUTOSAVE_INTERVAL_SECONDS).
    await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: 10_000 });

    // Not ready yet — no department, so no approval route resolves.
    await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled();
    await expect(page.getByText("Department required")).toBeVisible();

    await page.getByLabel("Department").click();
    await page.getByRole("option", { name: "Marketing" }).click();

    await expect(page.getByText("Marketing content")).not.toBeVisible(); // sanity: no leaked internals
    await expect(page.getByText("Jane Manager")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByText("We are thrilled to announce the new dashboard"),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Submit" }).click();
    const submitDialog = page.getByRole("dialog");
    await expect(submitDialog.getByText("Submit for approval?")).toBeVisible();
    await expect(submitDialog.getByText(/Jane Manager/)).toBeVisible();
    await submitDialog.getByRole("button", { name: "Submit" }).click();

    // Scoped to the heading role — Next.js's route-announcer div can carry
    // the same text and otherwise trips a strict-mode violation (the same
    // fix approval-review.spec.ts's own submit helper already applies).
    await expect(
      page.getByRole("heading", {
        name: "Your post has been submitted for approval.",
      }),
    ).toBeVisible();
    await expect(page.getByText(/Version 1/)).toBeVisible();
    await expect(page.getByText(/Assigned to Jane Manager/)).toBeVisible();
  });

  test("the editor has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "jane.manager@example.local", password);
    await page.goto("/posts/new");
    await page.waitForURL(/\/posts\/.+\/edit/);
    await page.getByLabel("Title").fill("Accessibility check post");

    const results = await new AxeBuilder({ page }).include("body").analyze();
    expect(results.violations).toEqual([]);
  });

  test("uploads an image, shows it in the media gallery, and can remove it", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "john.doe@example.local", password);
    await page.goto("/posts/new");
    await page.waitForURL(/\/posts\/.+\/edit/);
    await page.getByLabel("Title").fill("Media upload check post");

    const buffer = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: { r: 10, g: 200, b: 10 },
      },
    })
      .jpeg()
      .toBuffer();

    await page.getByLabel("Choose files to upload").setInputFiles({
      name: "photo.jpg",
      mimeType: "image/jpeg",
      buffer,
    });

    const thumbnail = page.getByRole("img", { name: "photo.jpg" });
    await expect(thumbnail).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("1 attachment valid")).toBeVisible();

    await thumbnail.hover();
    await page.getByRole("button", { name: "Remove photo.jpg" }).click();
    await expect(thumbnail).not.toBeVisible();
    await expect(page.getByText("Attachments valid")).toBeVisible();
  });

  test("mobile: the sticky action bar and expandable readiness summary work", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await page.setViewportSize({ width: 375, height: 800 });
    await login(page, "admin@example.local", password);
    await page.goto("/posts/new");
    await page.waitForURL(/\/posts\/.+\/edit/);
    await page.getByLabel("Title").fill("Mobile editor check post");

    await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();
    const summaryToggle = page.getByRole("button", { name: /of \d+ ready/ });
    await expect(summaryToggle).toBeVisible();
    await summaryToggle.click();
    await expect(summaryToggle.getByText("Title provided")).toBeVisible();
  });
});
