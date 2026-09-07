import { markRead } from "@/modules/notifications";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler<undefined, undefined>(
  {},
  async ({ params, user }) => {
    await markRead(params.id, user.id);
    return { data: { success: true } };
  },
);
