/**
 * Dev/test-only helper: clears LoginAttempt history for the seeded demo
 * accounts. Used by tests/e2e/shell.spec.ts, which logs into those
 * accounts repeatedly across local runs and would otherwise eventually
 * trip RATE_LIMIT_AUTH_MAX for real, same as any other repeated-login
 * pattern. Run via tsx (not imported directly) — see that file's comment
 * on why: Playwright's own module loader can't handle the generated
 * Prisma client's ESM output the way tsx/Next/vitest do.
 */
import { prisma } from "@/server/db";

const DEMO_EMAILS = [
  "john.doe@example.local",
  "jane.manager@example.local",
  "admin@example.local",
];

async function main() {
  await prisma.loginAttempt.deleteMany({
    where: { email: { in: DEMO_EMAILS } },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
