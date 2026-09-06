/**
 * Runs once when the Next.js server starts (dev, start, and the worker's
 * own entry point all trigger it). Importing the config module validates
 * the environment and exits the process on failure — see
 * src/server/config.ts and CONFIGURATION.md §10.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/server/config");
  }
}
