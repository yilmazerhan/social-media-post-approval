import { listEmailTemplates } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler(
  { permission: "EMAIL_MANAGE" },
  async () => {
    const templates = await listEmailTemplates();
    return { data: templates };
  },
);
