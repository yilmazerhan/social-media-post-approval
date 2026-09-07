import {
  getPreferences,
  updatePreferences,
  updatePreferencesSchema,
} from "@/modules/notifications";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler({}, async ({ user }) => {
  const preferences = await getPreferences(user.id);
  return { data: preferences };
});

export const PATCH = protectedHandler<
  ReturnType<typeof updatePreferencesSchema.parse>,
  undefined
>({ schema: updatePreferencesSchema }, async ({ user, input }) => {
  const preferences = await updatePreferences(user.id, input.preferences);
  return { data: preferences };
});
