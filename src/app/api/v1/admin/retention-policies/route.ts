import { listRetentionPolicies } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler(
  { permission: "RETENTION_MANAGE" },
  async () => {
    const policies = await listRetentionPolicies();
    return { data: policies };
  },
);
