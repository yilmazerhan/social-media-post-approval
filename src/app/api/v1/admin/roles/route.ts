import {
  listRoles,
  createRole,
  createRoleSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler({ permission: "ROLE_MANAGE" }, async () => {
  const roles = await listRoles();
  return { data: roles };
});

export const POST = protectedHandler<
  ReturnType<typeof createRoleSchema.parse>,
  undefined
>(
  { schema: createRoleSchema, permission: "ROLE_MANAGE" },
  async ({ input, user }) => {
    const created = await createRole(input, user.id);
    return { data: created, status: 201 };
  },
);
