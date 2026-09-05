/**
 * `NOTIFICATION_FANOUT` — ARCHITECTURE.md §7. Expands a group-routed
 * event (a post assigned to a group rather than one user) into one
 * `writeNotification` call per current member, registered against the
 * generic queue as a side effect of importing this file — `src/jobs/worker.ts`
 * imports it alongside every other module that owns a job type.
 */
import type { NotificationType } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { registerJobHandler } from "@/jobs/queue";
import { writeNotification } from "./service";

interface FanoutPayload {
  groupId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  postId?: string | null;
  actorId?: string | null;
}

function isFanoutPayload(value: unknown): value is FanoutPayload {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as FanoutPayload).groupId === "string" &&
    typeof (value as FanoutPayload).type === "string"
  );
}

registerJobHandler("NOTIFICATION_FANOUT", async (payload) => {
  if (!isFanoutPayload(payload)) {
    throw new Error("NOTIFICATION_FANOUT payload missing groupId/type.");
  }
  const members = await prisma.userGroup.findMany({
    where: { groupId: payload.groupId },
    select: { userId: true },
  });
  for (const member of members) {
    await writeNotification({
      recipientId: member.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      entityType: payload.entityType,
      entityId: payload.entityId,
      postId: payload.postId,
      actorId: payload.actorId,
    });
  }
});
