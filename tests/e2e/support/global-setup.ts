import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  seedDemoAccounts,
  resetLoginAttempts,
  PASSWORD_FILE,
} from "./demo-accounts";

/**
 * Runs once for the whole `playwright test` invocation, before any spec
 * file. Every spec file that logs in as a demo account needs the same
 * seed to have already run — `db:seed` regenerates the demo password each
 * time it runs, so if two spec files each seeded independently (as they
 * did before this existed), running with more than one worker let one
 * file's seed invalidate a password another file had already read.
 * Seeding exactly once here removes that race instead of serializing the
 * whole suite to work around it.
 */
export default function globalSetup() {
  const password = seedDemoAccounts();
  resetLoginAttempts();
  mkdirSync(path.dirname(PASSWORD_FILE), { recursive: true });
  writeFileSync(PASSWORD_FILE, JSON.stringify({ password }));
}
