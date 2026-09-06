/** Read-only user counts for the admin dashboard — UI_UX_SPEC.md §6. */
import { prisma } from "@/server/db";

export interface UserStats {
  total: number;
  active: number;
}

export async function getUserStats(): Promise<UserStats> {
  const [total, active] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
  ]);
  return { total, active };
}
