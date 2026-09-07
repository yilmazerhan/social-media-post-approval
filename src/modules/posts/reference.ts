/**
 * Human-facing post references (`POST-2026-000412`) — DATABASE.md §4 gives
 * the format but not the generation rule. Computed as "one more than the
 * count for this year so far", with the insert itself guarded by
 * `reference`'s own unique constraint and a bounded retry — correct under
 * a race without a dedicated sequence table.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

const MAX_ATTEMPTS = 5;

async function nextReference(
  db: Prisma.TransactionClient | PrismaClient,
  year: number,
): Promise<string> {
  const prefix = `POST-${year}-`;
  const count = await db.post.count({
    where: { reference: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

/**
 * Runs `create` with a freshly generated reference, retrying with the next
 * number if a concurrent request already claimed it.
 */
export async function createWithGeneratedReference<T>(
  db: Prisma.TransactionClient | PrismaClient,
  create: (reference: string) => Promise<T>,
): Promise<T> {
  const year = new Date().getUTCFullYear();
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const reference = await nextReference(db, year);
    try {
      return await create(reference);
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
