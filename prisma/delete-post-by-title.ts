/**
 * Dev/test-only helper: deletes Post rows by exact title (cascade takes
 * versions, assignments and actions with it — DATABASE.md §8). Used by
 * tests/e2e/editor.spec.ts, which submits a real post against the shared
 * dev database and would otherwise permanently change the counts
 * tests/e2e/dashboard.spec.ts pins to the seeded hero-post fixture.
 *
 * Notification.postId is `onDelete: SetNull` (a real notification
 * legitimately survives its post's deletion in production), so this also
 * deletes that post's Notification rows explicitly first — otherwise a
 * same-titled post created by the next test run picks up an orphaned,
 * postId-null notification alongside its own real one.
 */
import { prisma } from "@/server/db";

async function main() {
  const title = process.argv[2];
  if (!title) {
    throw new Error("Usage: tsx prisma/delete-post-by-title.ts <title>");
  }
  // A post never submitted keeps its user-visible title in `draftTitle`
  // only — `title` stays whatever it was set to at creation (empty) until
  // a real submit finalizes it (see submit.ts's `draftTitle ?? title`).
  const where = { OR: [{ title }, { draftTitle: title }] };
  const posts = await prisma.post.findMany({
    where,
    select: { id: true },
  });
  const postIds = posts.map((p) => p.id);
  if (postIds.length > 0) {
    await prisma.notification.deleteMany({
      where: { postId: { in: postIds } },
    });
  }
  await prisma.post.deleteMany({ where });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
