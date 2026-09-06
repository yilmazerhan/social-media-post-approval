import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readSeededPassword, login } from "./support/demo-accounts";
import { deleteUserByEmail } from "./support/db-cleanup";

/**
 * Phase 21 — Administration, driven through the real screen. Neither test
 * touches a seeded demo account or a system role — every other spec file
 * in this shared-database suite pins exact counts and grants to those
 * (tests/e2e/dashboard.spec.ts's "3"/"3" user totals, shell.spec.ts's
 * per-role nav assertions) — so this creates its own throwaway user (and
 * a throwaway custom role, which has no delete endpoint by design and so
 * is left behind harmlessly) instead.
 */

const NEW_USER_EMAIL = `e2e-admin-temp-${Date.now()}@example.local`;
const NEW_USER_DISPLAY_NAME = `Ephemeral Test User ${Date.now()}`;
const NEW_USER_PASSWORD = "Str0ngPassw0rd2026";
const NEW_ROLE_KEY = `E2E_TEST_ROLE_${Date.now()}`;
const NEW_ROLE_NAME = `E2E test role ${Date.now()}`;

test.afterAll(() => {
  deleteUserByEmail(NEW_USER_EMAIL);
});

async function openAdminSection(page: Page, label: string) {
  await page.goto("/admin");
  await page.getByRole("tablist").getByRole("tab", { name: label }).click();
}

/**
 * Radix Toast renders both the visible toast and a duplicate `aria-live`
 * announcement of the same text — `getByText` alone matches both, so this
 * scopes to the visible title element specifically.
 */
function expectToast(page: Page, text: string) {
  return expect(
    page.locator('[data-slot="toast-title"]', { hasText: text }),
  ).toBeVisible();
}

test.describe("Administration", () => {
  test("an admin disables a user and their active session is revoked immediately", async ({
    page,
    browser,
  }) => {
    const password = readSeededPassword();
    await login(page, "admin@example.local", password);

    await openAdminSection(page, "Users");
    await page.getByRole("button", { name: "New user" }).click();

    const createDialog = page.getByRole("dialog", { name: "New user" });
    await createDialog.getByLabel("Email").fill(NEW_USER_EMAIL);
    await createDialog.getByLabel("First name").fill("Ephemeral");
    await createDialog.getByLabel("Last name").fill("Tester");
    await createDialog.getByLabel("Display name").fill(NEW_USER_DISPLAY_NAME);
    await createDialog.getByRole("button", { name: "Create user" }).click();
    await expectToast(page, "User created.");

    // Give the new, still-PENDING LOCAL user a known password directly —
    // the same admin action UI_UX_SPEC.md §6 names for this section.
    await expect(
      page.getByRole("button", { name: NEW_USER_DISPLAY_NAME }),
    ).toBeVisible();
    await page.getByRole("button", { name: NEW_USER_DISPLAY_NAME }).click();
    const detailSheet = page.getByRole("dialog", {
      name: NEW_USER_DISPLAY_NAME,
    });
    await expect(detailSheet).toBeVisible();
    await detailSheet.getByRole("button", { name: "Reset password" }).click();

    const resetDialog = page.getByRole("dialog", { name: "Reset password" });
    await resetDialog.getByLabel("New password").fill(NEW_USER_PASSWORD);
    await resetDialog.getByRole("button", { name: "Reset password" }).click();
    await expectToast(page, "Every session for this user was signed out.");

    // The freshly reset user signs in for real, in their own context.
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    await login(userPage, NEW_USER_EMAIL, NEW_USER_PASSWORD);
    await expect(userPage).toHaveURL("/dashboard");

    // Back as the admin: disable the user, with the confirm the spec
    // requires for a destructive account action.
    await detailSheet.getByRole("button", { name: "Disable user" }).click();
    const confirmDisable = page.getByRole("dialog", {
      name: "Disable this user?",
    });
    await confirmDisable.getByRole("button", { name: "Disable" }).click();
    await expectToast(page, "User disabled.");

    // The disabled user's live session dies on its very next request —
    // the same exit criterion Phase 4 proved for the API, now proved
    // through the real screen.
    await userPage.goto("/dashboard");
    await expect(userPage).toHaveURL("/login");
    await userContext.close();
  });

  test("an admin creates a role, edits its permission grants, and the change persists after reload", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "admin@example.local", password);

    await openAdminSection(page, "Roles");
    await page.getByRole("button", { name: "New role" }).click();

    const createDialog = page.getByRole("dialog", { name: "New role" });
    await createDialog.getByLabel("Key").fill(NEW_ROLE_KEY);
    await createDialog.getByLabel("Name").fill(NEW_ROLE_NAME);
    await createDialog.getByLabel("View users").check();
    await createDialog.getByRole("button", { name: "Create role" }).click();
    await expectToast(page, "Role created.");

    await expect(
      page.getByRole("button", { name: NEW_ROLE_NAME }),
    ).toBeVisible();
    await page.getByRole("button", { name: NEW_ROLE_NAME }).click();
    const editSheet = page.getByRole("dialog", { name: NEW_ROLE_NAME });
    await expect(editSheet.getByLabel("View users")).toBeChecked();
    await expect(
      editSheet.getByLabel("Manage roles and permission grants"),
    ).not.toBeChecked();

    await editSheet.getByLabel("Manage roles and permission grants").check();
    await editSheet.getByRole("button", { name: "Save permissions" }).click();
    await expectToast(page, "Permissions updated.");

    // Reload from scratch and re-open the same role — proves the grant
    // was actually persisted server-side, not just held in local state.
    await page.reload();
    await openAdminSection(page, "Roles");
    await page.getByRole("button", { name: NEW_ROLE_NAME }).click();
    const reopenedSheet = page.getByRole("dialog", { name: NEW_ROLE_NAME });
    await expect(reopenedSheet.getByLabel("View users")).toBeChecked();
    await expect(
      reopenedSheet.getByLabel("Manage roles and permission grants"),
    ).toBeChecked();
  });

  test("the Users and Roles tables have no automatically detectable accessibility violations", async ({
    page,
  }) => {
    const password = readSeededPassword();
    await login(page, "admin@example.local", password);

    await openAdminSection(page, "Users");
    await expect(page.getByRole("table")).toBeVisible();
    const usersResults = await new AxeBuilder({ page })
      .include("body")
      .analyze();
    expect(usersResults.violations).toEqual([]);

    await openAdminSection(page, "Roles");
    await expect(page.getByRole("table")).toBeVisible();
    const rolesResults = await new AxeBuilder({ page })
      .include("body")
      .analyze();
    expect(rolesResults.violations).toEqual([]);
  });
});
