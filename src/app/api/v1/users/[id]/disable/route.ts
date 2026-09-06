import { setUserEnabled } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

/** Also revokes every active session for this user (API.md, AUTHENTICATION.md's "immediate invalidation on user disablement"). */
export const POST = protectedHandler<undefined, undefined>(
  { permission: "USER_MANAGE" },
  async ({ params, user }) => {
    const updated = await setUserEnabled(params.id, false, user.id);
    return { data: updated };
  },
);
