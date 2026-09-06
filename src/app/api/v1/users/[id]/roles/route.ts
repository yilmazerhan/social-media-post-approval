import { assignRole, assignRoleSchema } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler<
  ReturnType<typeof assignRoleSchema.parse>,
  undefined
>(
  { schema: assignRoleSchema, permission: "USER_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await assignRole(params.id, input.roleKey, user.id);
    return { data: updated, status: 201 };
  },
);
