/**
 * Dev/test-only helper: deletes Post rows by exact title (cascade takes
 * versions, assignments and actions with it — DATABASE.md §8). Used by
 * tests/e2e/editor.spec.ts, which submits a real post against the shared
 * dev database and would otherwise permanently change the counts
 * tests/e2e/dashboard.spec.ts pins to the seeded hero-post fixture.
 */
import { prisma } from "@/server/db";

async function main() {
  const title = process.argv[2];
  if (!title) {
    throw new Error("Usage: tsx prisma/delete-post-by-title.ts <title>");
  }
  await prisma.post.deleteMany({ where: { title } });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
