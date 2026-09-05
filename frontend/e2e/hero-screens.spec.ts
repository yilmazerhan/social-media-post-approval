import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage of the two hero screens against a running backend seeded with the demo
 * profile. These are the journeys that must never silently break: an author writing and submitting,
 * an approver deciding, and the guards that stop either from happening by accident.
 *
 * Run with the backend on :8080 (profiles local,demo) and the dev server on :5173.
 */

const PASSWORD = 'Demo!Passw0rd';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/posts$/);
}

test.describe('Approval review — the reviewer journey', () => {
  test('shows the whole situation without leaving the page', async ({ page }) => {
    await signIn(page, 'sarah.johnson');
    await page.getByRole('link', { name: 'Approvals' }).click();
    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();

    await page.getByText('Introducing Kron PAM 4.0').first().click();
    await page.waitForURL(/\/approvals\/.+\/review/);

    // The six facts of the decision context bar.
    await expect(page.getByText('Current status')).toBeVisible();
    await expect(page.getByText('Creator').first()).toBeVisible();
    await expect(page.getByText('Version', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('AI risk')).toBeVisible();
    await expect(page.getByText('Version 3 awaiting approval').first()).toBeVisible();

    // Content, findings, history and discussion are all on the one screen.
    await expect(page.getByRole('heading', { name: 'Content preview' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AI review' })).toBeVisible();
    await expect(page.getByText('AI-assisted analysis. Human approval required.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review history' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review discussion' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your decision' })).toBeVisible();
  });

  test('refuses a rejection with no reason', async ({ page }) => {
    await signIn(page, 'sarah.johnson');
    await page.goto('/approvals');
    await page.getByText('Introducing Kron PAM 4.0').first().click();

    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByRole('heading', { name: 'Reject this post?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject post' })).toBeDisabled();
    await page.getByLabel('Rejection reason').fill('Not cleared by legal.');
    await expect(page.getByRole('button', { name: 'Reject post' })).toBeEnabled();
  });

  test('keyboard shortcut opens the approval confirmation, and names the version', async ({ page }) => {
    await signIn(page, 'sarah.johnson');
    await page.goto('/approvals');
    await page.getByText('Introducing Kron PAM 4.0').first().click();
    await expect(page.getByRole('heading', { name: 'Your decision' })).toBeVisible();

    await page.keyboard.press('a');
    await expect(page.getByRole('heading', { name: 'Approve this post?' })).toBeVisible();
    await expect(page.getByText('Version 3 will be recorded as the approved version.')).toBeVisible();
  });

  test('compares versions and shows what actually changed', async ({ page }) => {
    await signIn(page, 'sarah.johnson');
    await page.goto('/approvals');
    await page.getByText('Introducing Kron PAM 4.0').first().click();

    await page.getByRole('button', { name: 'Compare versions' }).click();
    await expect(page.getByRole('heading', { name: /Compare versions/ })).toBeVisible();
    await expect(page.getByText('Version 3 is the version awaiting approval.')).toBeVisible();
    await expect(page.getByText('What changed').first()).toBeVisible();
  });
});

test.describe('Post editor — the author journey', () => {
  test('opens a draft with the three workspaces', async ({ page }) => {
    await signIn(page, 'john.smith');
    await page.getByText('Security advisory: quarterly patch cycle').first().click();
    await page.waitForURL(/\/posts\/.+\/edit/);

    await expect(page.getByRole('heading', { name: 'Create your post' })).toBeVisible();
    await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.getByText('Live preview')).toBeVisible();
    await expect(page.getByText('Post settings')).toBeVisible();
    await expect(page.getByText('Approval route')).toBeVisible();
    await expect(page.getByText('Add images or videos')).toBeVisible();
  });

  test('a post in review is read-only and says why', async ({ page }) => {
    await signIn(page, 'john.smith');
    await page.getByText('Introducing Kron PAM 4.0').first().click();
    await expect(page.getByText('This post is being reviewed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
  });

  test('the pre-submission dialog states the checks and the consequence', async ({ page }) => {
    await signIn(page, 'john.smith');
    await page.getByText('Security advisory: quarterly patch cycle').first().click();
    await page.getByLabel('Title').fill('Security advisory: quarterly patch cycle');
    await page.getByRole('button', { name: 'Submit for approval' }).click();

    await expect(page.getByRole('heading', { name: 'Ready to submit?' })).toBeVisible();
    await expect(page.getByText('Content added')).toBeVisible();
    await expect(page.getByText('Approval route assigned')).toBeVisible();
    await expect(
      page.getByText('Once submitted, the content cannot be edited unless the reviewer requests changes.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to editing' }).click();
  });
});

test.describe('Access', () => {
  test('an employee cannot reach the approvals queue', async ({ page }) => {
    await signIn(page, 'john.smith');
    await expect(page.getByRole('link', { name: 'Approvals' })).toHaveCount(0);
    await page.goto('/approvals');
    await expect(page.getByText('You do not have access to this screen')).toBeVisible();
  });

  test('an administrator sees both workspaces', async ({ page }) => {
    await signIn(page, 'admin');
    await expect(page.getByRole('link', { name: 'My posts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Approvals' })).toBeVisible();
  });
});

test.describe('Mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the editor becomes tabs and the review keeps its decision bar', async ({ page }) => {
    await signIn(page, 'john.smith');
    await page.getByText('Security advisory: quarterly patch cycle').first().click();
    await expect(page.getByRole('tab', { name: 'Editor' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Preview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible();

    await page.goto('/login');
    await signIn(page, 'sarah.johnson');
    await page.goto('/approvals');
    await page.getByText('Introducing Kron PAM 4.0').first().click();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Changes', exact: true })).toBeVisible();
  });
});
