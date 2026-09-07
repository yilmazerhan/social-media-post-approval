import { setUserEnabled } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler<undefined, undefined>(
  { permission: "USER_MANAGE" },
  async ({ params, user }) => {
    const updated = await setUserEnabled(params.id, true, user.id);
    return { data: updated };
  },
);
