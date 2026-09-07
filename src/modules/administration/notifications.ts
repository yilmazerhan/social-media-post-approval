/**
 * Notifications administration — UI_UX_SPEC.md §6's "Notifications" admin
 * section. No global notification settings exist anywhere in the spec
 * (per-user preferences are Phase 16's own, self-service `/notifications`
 * page); this stays a minimal read-only volume summary, grouped by type,
 * over the existing `Notification` table.
 */
import { prisma } from "@/server/db";

export interface NotificationVolumeSummary {
  type: string;
  total: number;
  unread: number;
}

export async function listNotificationVolumeSummary(): Promise<
  NotificationVolumeSummary[]
> {
  const [totals, unread] = await Promise.all([
    prisma.notification.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.notification.groupBy({
      by: ["type"],
      where: { readAt: null },
      _count: { _all: true },
    }),
  ]);
  const unreadByType = new Map(unread.map((u) => [u.type, u._count._all]));
  return totals.map((t) => ({
    type: t.type,
    total: t._count._all,
    unread: unreadByType.get(t.type) ?? 0,
  }));
}
