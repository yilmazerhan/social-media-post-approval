import { getEmailSettings } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

/** Read-only: SMTP host/port/credentials stay env-only (CONFIGURATION.md) — there is no PATCH here. */
export const GET = protectedHandler(
  { permission: "EMAIL_MANAGE" },
  async () => {
    return { data: getEmailSettings() };
  },
);
