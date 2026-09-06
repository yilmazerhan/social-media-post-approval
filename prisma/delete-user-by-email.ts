/**
 * Dev/test-only helper: deletes a User row by exact email (cascades take
 * its sessions, role grants and password-reset tokens with it —
 * DATABASE.md §8). Used by tests/e2e/admin.spec.ts, which creates a real
 * throwaway user against the shared dev database via the Users admin
 * section and would otherwise permanently change the user counts
 * tests/e2e/dashboard.spec.ts pins to the seeded fixture, the same reason
 * delete-post-by-title.ts exists for posts.
 */
import { prisma } from "@/server/db";

async function main() {
  const email = process.argv[2];
  if (!email) {
    throw new Error("Usage: tsx prisma/delete-user-by-email.ts <email>");
  }
  await prisma.user.deleteMany({ where: { email } });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
