import { z } from "zod";
import type { NotificationType } from "@/generated/prisma/client";
import { NOTIFICATION_TYPES } from "./service";

const notificationType = z.enum(
  NOTIFICATION_TYPES as [NotificationType, ...NotificationType[]],
);

export const updatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: notificationType,
        inAppEnabled: z.boolean().optional(),
        emailEnabled: z.boolean().optional(),
      }),
    )
    .min(1),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
