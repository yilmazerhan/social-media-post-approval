import { test, expect } from "@playwright/test";

test("home page renders the placeholder shell", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Content Approval" }),
  ).toBeVisible();
});
