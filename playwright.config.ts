import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Seeds the demo accounts exactly once for the whole run — see
  // support/global-setup.ts for why that matters with more than one spec
  // file logging in as them.
  globalSetup: "./tests/e2e/support/global-setup.ts",
  // Every spec shares one real, persistent dev database rather than a
  // disposable per-run schema — some specs read exact counts seeded by
  // db:seed (tests/e2e/dashboard.spec.ts), and others now create and
  // submit real posts against that same database (tests/e2e/editor.spec.ts).
  // Two workers running those concurrently raced: a submit's `SELECT ...
  // FOR UPDATE` plus new-post creation was enough contention to blow past
  // request timeouts, and the resulting nondeterministic row counts broke
  // the exact-count assertions. One worker removes the whole class of
  // cross-spec interference instead of chasing individual races.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: "/opt/pw-browsers/chromium",
        },
      },
    },
  ],
  webServer: {
    command: "npx next dev --turbopack -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // .env's APP_URL is localhost:3000 (the real dev port); this server
    // runs on 3100 instead so it never collides with a `next dev` someone
    // already has running. Without this override, CSRF's Origin check
    // (verifyCsrf in server/http/csrf.ts) rejects every mutation the
    // e2e suite makes, since the browser's Origin header would be 3100
    // but the server would expect 3000.
    //
    // RATE_LIMIT_AUTH_MAX is also raised here: `isRateLimited` in
    // modules/auth/local/login.ts counts by IP as well as by email, and
    // every e2e login comes from this one machine's loopback address.
    // The suite now legitimately performs more real, successful logins
    // across the three demo accounts than the production default (10 per
    // 15 minutes) allows for — that default is the real control guarding
    // against credential stuffing and stays untouched for the app itself.
    env: {
      APP_URL: "http://localhost:3100",
      PORT: "3100",
      RATE_LIMIT_AUTH_MAX: "100",
    },
  },
});
