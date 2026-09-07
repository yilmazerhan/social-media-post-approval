import {
  updateRolePermissions,
  updateRolePermissionsSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof updateRolePermissionsSchema.parse>,
  undefined
>(
  { schema: updateRolePermissionsSchema, permission: "ROLE_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateRolePermissions(
      params.id,
      input.permissionKeys,
      user.id,
    );
    return { data: updated };
  },
);
