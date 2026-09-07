import { runRetention, retentionRunSchema } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler<
  ReturnType<typeof retentionRunSchema.parse>,
  undefined
>(
  { schema: retentionRunSchema, permission: "RETENTION_MANAGE" },
  async ({ input }) => {
    const result = await runRetention(input.target, input.dryRun);
    return { data: result };
  },
);
