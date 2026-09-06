import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * A spec that submits a real post against the shared dev database (rather
 * than only reading seeded fixtures) needs to remove what it created —
 * otherwise it permanently changes the counts other specs
 * (tests/e2e/dashboard.spec.ts) pin to the seeded hero-post fixture. Runs
 * via a tsx subprocess for the same reason seeding does — see
 * ./demo-accounts.ts.
 */
const tsxBin = path.resolve(__dirname, "../../../node_modules/.bin/tsx");
const deleteByTitleEntry = path.resolve(
  __dirname,
  "../../../prisma/delete-post-by-title.ts",
);
const deleteUserByEmailEntry = path.resolve(
  __dirname,
  "../../../prisma/delete-user-by-email.ts",
);

export function deletePostByTitle(title: string): void {
  const result = spawnSync(tsxBin, [deleteByTitleEntry, title], {
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(`delete-post-by-title failed: ${result.stderr}`);
  }
}

/** Used by tests/e2e/admin.spec.ts — see prisma/delete-user-by-email.ts. */
export function deleteUserByEmail(email: string): void {
  const result = spawnSync(tsxBin, [deleteUserByEmailEntry, email], {
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(`delete-user-by-email failed: ${result.stderr}`);
  }
}
