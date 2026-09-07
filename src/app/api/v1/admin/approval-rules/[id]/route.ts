import {
  updateApprovalRule,
  deleteApprovalRule,
  updateApprovalRuleSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof updateApprovalRuleSchema.parse>,
  undefined
>(
  { schema: updateApprovalRuleSchema, permission: "SETTINGS_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateApprovalRule(params.id, input, user.id);
    return { data: updated };
  },
);

export const DELETE = protectedHandler<undefined, undefined>(
  { permission: "SETTINGS_MANAGE" },
  async ({ params, user }) => {
    await deleteApprovalRule(params.id, user.id);
    return { data: { success: true } };
  },
);
