import { removeRole } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const DELETE = protectedHandler<undefined, undefined>(
  { permission: "USER_MANAGE" },
  async ({ params, user }) => {
    await removeRole(params.id, params.roleKey, user.id);
    return { data: { success: true } };
  },
);
