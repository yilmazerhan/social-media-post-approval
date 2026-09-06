import type { RetentionTarget } from "@/generated/prisma/client";
import {
  updateRetentionPolicy,
  retentionPolicySchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof retentionPolicySchema.parse>,
  undefined
>(
  { schema: retentionPolicySchema, permission: "RETENTION_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateRetentionPolicy(
      params.target as RetentionTarget,
      input,
      user.id,
    );
    return { data: updated };
  },
);
