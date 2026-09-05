/**
 * Notification writes, reads, and preferences — DATABASE.md §6, API.md's
 * `/api/v1/notifications*`. `writeNotification` is the one place every
 * other module creates a `Notification` row (mirroring how `writeAudit`
 * is the one place for `AuditLog`) — it's also the one place a
 * `NotificationPreference` opt-out is honored, so no caller can
 * accidentally bypass it.
 */
import type {
  NotificationType,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import type { NotificationDto, NotificationPreferenceDto } from "./types";

/** The full catalogue — mirrors `enum NotificationType` in schema.prisma exactly, the same "canonical array" pattern `PERMISSIONS` uses. */
export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "POST_SUBMITTED",
  "APPROVAL_ASSIGNED",
  "CHANGES_REQUESTED",
  "POST_APPROVED",
  "POST_REJECTED",
  "COMMENT_MENTION",
  "COMMENT_ADDED",
  "SLA_WARNING",
  "SLA_OVERDUE",
  "ESCALATION",
];

export interface WriteNotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  postId?: string | null;
  actorId?: string | null;
}

/** Skips the write entirely when the recipient has turned this type's in-app notifications off — never writes a row nobody wants to see. */
export async function writeNotification(
  input: WriteNotificationInput,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  const preference = await client.notificationPreference.findUnique({
    where: { userId_type: { userId: input.recipientId, type: input.type } },
    select: { inAppEnabled: true },
  });
  if (preference && !preference.inAppEnabled) return;

  await client.notification.create({
    data: {
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      postId: input.postId ?? undefined,
      actorId: input.actorId ?? undefined,
    },
  });
}

/** Group-assignment case: ARCHITECTURE.md's `NOTIFICATION_FANOUT` job expands group membership into individual `writeNotification` calls asynchronously, instead of writing N rows inside the triggering transaction. */
export async function enqueueGroupFanout(
  input: Omit<WriteNotificationInput, "recipientId"> & { groupId: string },
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.backgroundJob.create({
    data: {
      type: "NOTIFICATION_FANOUT",
      payload: input as unknown as Prisma.InputJsonValue,
    },
  });
}

export type NotificationFilter = "all" | "unread" | "mentions";

export async function listNotifications(
  userId: string,
  filter: NotificationFilter,
): Promise<NotificationDto[]> {
  const where: Prisma.NotificationWhereInput = { recipientId: userId };
  if (filter === "unread") where.readAt = null;
  if (filter === "mentions") where.type = "COMMENT_MENTION";

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { displayName: true } } },
    take: 100,
  });

  return notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    postId: n.postId,
    actorName: n.actor?.displayName ?? null,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
  }));
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientId: userId, readAt: null },
  });
}

export async function markRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({
      where: { id: notificationId, recipientId: userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError();
    // Already read — POST /:id/read is a no-op success in that case, not an error.
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getPreferences(
  userId: string,
): Promise<NotificationPreferenceDto[]> {
  const stored = await prisma.notificationPreference.findMany({
    where: { userId },
  });
  const byType = new Map(stored.map((p) => [p.type, p]));
  return NOTIFICATION_TYPES.map((type) => {
    const row = byType.get(type);
    return {
      type,
      inAppEnabled: row?.inAppEnabled ?? true,
      emailEnabled: row?.emailEnabled ?? true,
    };
  });
}

export async function updatePreferences(
  userId: string,
  updates: {
    type: NotificationType;
    inAppEnabled?: boolean;
    emailEnabled?: boolean;
  }[],
): Promise<NotificationPreferenceDto[]> {
  for (const update of updates) {
    await prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type: update.type } },
      create: {
        userId,
        type: update.type,
        inAppEnabled: update.inAppEnabled ?? true,
        emailEnabled: update.emailEnabled ?? true,
      },
      update: {
        ...(update.inAppEnabled !== undefined
          ? { inAppEnabled: update.inAppEnabled }
          : {}),
        ...(update.emailEnabled !== undefined
          ? { emailEnabled: update.emailEnabled }
          : {}),
      },
    });
  }
  return getPreferences(userId);
}
