import { test, expect } from "@playwright/test";
import { readSeededPassword, login } from "./support/demo-accounts";
import { deletePostByTitle } from "./support/db-cleanup";

/**
 * Phase 26 — the full business journey in one continuous run: create,
 * submit, get sent back for changes, resubmit, get approved. Every other
 * e2e spec exercises one slice of this in isolation (editor.spec.ts stops
 * at submit; approval-review.spec.ts starts from an already-submitted
 * post); this is the one place the whole lifecycle runs end to end
 * against a real browser, proving the pieces actually connect: the
 * creator's own notification/dashboard tile for CHANGES_REQUESTED, the
 * edit link only appearing because canEdit flips on, RESUBMIT reusing the
 * same Submit button and API path as the original SUBMIT, and the
 * approval history showing both decisions against the right versions.
 */

const TITLE = "Full journey check post";

test.afterEach(() => {
  deletePostByTitle(TITLE);
});

test.describe("Full business journey", () => {
  test("draft, submit, changes requested, resubmit, approved", async ({
    page,
  }) => {
    // Five logins, two full submit round trips and two approval decisions —
    // genuinely more real work than any other single spec, so the default
    // 30s per-test budget is too tight in a CPU-constrained dev environment
    // (a route Turbopack hasn't compiled yet routinely costs several real
    // seconds on its own).
    test.setTimeout(60_000);
    const password = readSeededPassword();

    // 1. Employee creates and submits a draft.
    await login(page, "john.doe@example.local", password);
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Create" })
      .click();
    await page.waitForURL(/\/posts\/.+\/edit/);
    const postUrl = page.url();
    const postId = postUrl.match(/\/posts\/([^/]+)\/edit/)?.[1];
    if (!postId) throw new Error("could not extract post id from URL");

    await page.getByLabel("Title").fill(TITLE);
    await page.getByRole("textbox", { name: "Post content" }).click();
    await page.keyboard.type("First draft of the announcement.");
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

    // 2. Approver requests changes.
    await login(page, "jane.manager@example.local", password);
    await page.goto("/approvals");
    await page.getByRole("link", { name: TITLE }).click();
    await page.waitForURL(/\/approvals\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: "Request changes" }).click();
    await page
      .getByLabel("Comment (required for changes and rejection)")
      .fill("Please add a call to action.");
    await page.getByRole("button", { name: "Request changes" }).click();
    await expect(
      page.getByRole("heading", { name: /Request changes on version 1/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("CHANGES REQUESTED")).toBeVisible();

    // 3. Creator edits and resubmits. Goes straight to the post via its
    // known id (tests/e2e/posts.spec.ts already covers reaching a post
    // through the My Posts list itself) rather than by clicking through
    // the dashboard's "Changes requested" tile.
    await login(page, "john.doe@example.local", password);
    await page.goto(`/posts/${postId}/edit`);

    // This test's own earlier draft-editing (step 1) left a local autosave
    // snapshot for this same post in this same browser session — the
    // editor offers to restore it. This step means to edit the server's
    // current (post-changes-requested) version, not that stale local one.
    const restorePrompt = page.getByRole("button", { name: "Discard" });
    if (await restorePrompt.isVisible().catch(() => false)) {
      await restorePrompt.click();
    }

    const changesBanner = page.getByRole("status");
    await expect(changesBanner).toContainText(
      "Changes requested on version 1",
      {
        timeout: 10_000,
      },
    );
    await expect(changesBanner).toContainText("Please add a call to action.");

    await page.getByRole("textbox", { name: "Post content" }).click();
    await page.keyboard.type(" Sign up today.");
    // Autosave fires on a debounce (AUTOSAVE_INTERVAL_SECONDS) — wait for
    // it to settle before submitting, the same way editor.spec.ts's first
    // submission does, so the draft-recovery prompt has no stale local
    // snapshot left to react to.
    await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: 10_000 });
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
    await expect(page.getByText(/Version 2/)).toBeVisible();

    // 4. Approver reviews the new version and approves.
    await login(page, "jane.manager@example.local", password);
    await page.goto("/approvals");
    await page.getByRole("link", { name: TITLE }).click();
    await page.waitForURL(/\/approvals\/[0-9a-f-]+$/);
    await expect(
      page.getByText("Reviewing version 2", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(
      page.getByRole("heading", { name: /Approve version 2 of/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("APPROVED")).toBeVisible();

    // 5. The post's own history shows both decisions against the right versions.
    await page.goto(`/posts/${postId}`);
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Approval history" }).click();
    await expect(
      page.getByText(/requested changes on version 1/i),
    ).toBeVisible();
    await expect(page.getByText(/approved version 2/i)).toBeVisible();
  });
});
