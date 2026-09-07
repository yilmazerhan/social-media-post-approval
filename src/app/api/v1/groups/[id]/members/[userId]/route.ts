import { removeGroupMember } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const DELETE = protectedHandler<undefined, undefined>(
  { permission: "GROUP_MANAGE" },
  async ({ params, user }) => {
    await removeGroupMember(params.id, params.userId, user.id);
    return { data: { success: true } };
  },
);
