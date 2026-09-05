import { getUnreadCount } from "@/modules/notifications";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler({}, async ({ user }) => {
  const count = await getUnreadCount(user.id);
  return { data: { count } };
});
