import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
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
    env: { APP_URL: "http://localhost:3100", PORT: "3100" },
  },
});
