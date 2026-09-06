import { listSystemSettings } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler(
  { permission: "SETTINGS_MANAGE" },
  async () => {
    const settings = await listSystemSettings();
    return { data: settings };
  },
);
