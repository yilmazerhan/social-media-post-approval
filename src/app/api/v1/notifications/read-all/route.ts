import { markAllRead } from "@/modules/notifications";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler({}, async ({ user }) => {
  await markAllRead(user.id);
  return { data: { success: true } };
});
