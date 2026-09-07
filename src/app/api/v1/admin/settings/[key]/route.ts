import {
  updateSystemSetting,
  systemSettingSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof systemSettingSchema.parse>,
  undefined
>(
  { schema: systemSettingSchema, permission: "SETTINGS_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateSystemSetting(params.key, input.value, user.id);
    return { data: updated };
  },
);
