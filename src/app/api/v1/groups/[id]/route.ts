import { updateGroup, updateGroupSchema } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof updateGroupSchema.parse>,
  undefined
>(
  { schema: updateGroupSchema, permission: "GROUP_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateGroup(params.id, input, user.id);
    return { data: updated };
  },
);
