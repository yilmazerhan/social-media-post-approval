/** A processed assertion ID can never be consumed twice — DATABASE.md §3. */
import { prisma } from "@/server/db";

/** Returns true and records the assertion if it hasn't been seen before; false if it's a replay. */
export async function tryConsumeAssertion(
  assertionId: string,
  notOnOrAfter: Date,
): Promise<boolean> {
  try {
    await prisma.samlReplayGuard.create({
      data: { assertionId, notOnOrAfter },
    });
    return true;
  } catch {
    return false;
  }
}

export async function sweepExpiredReplayGuards(): Promise<number> {
  const result = await prisma.samlReplayGuard.deleteMany({
    where: { notOnOrAfter: { lt: new Date() } },
  });
  return result.count;
}
