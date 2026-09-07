import {
  updateSlaPolicy,
  deleteSlaPolicy,
  updateSlaPolicySchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof updateSlaPolicySchema.parse>,
  undefined
>(
  { schema: updateSlaPolicySchema, permission: "SETTINGS_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateSlaPolicy(params.id, input, user.id);
    return { data: updated };
  },
);

export const DELETE = protectedHandler<undefined, undefined>(
  { permission: "SETTINGS_MANAGE" },
  async ({ params, user }) => {
    await deleteSlaPolicy(params.id, user.id);
    return { data: { success: true } };
  },
);
