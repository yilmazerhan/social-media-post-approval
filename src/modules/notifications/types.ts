import type { NotificationType } from "@/generated/prisma/client";

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  postId: string | null;
  actorName: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPreferenceDto {
  type: NotificationType;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}
