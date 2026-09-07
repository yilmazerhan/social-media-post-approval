import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Integration tests share one real Postgres database; several assert
    // a delta across a snapshot taken before/after their own writes
    // (tests/integration/dashboard.test.ts's system-wide aggregates), which
    // only holds if no other file is writing to the same tables at the
    // same time. Running test files one at a time removes that whole
    // class of cross-file race instead of chasing it per test.
    fileParallelism: false,
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
