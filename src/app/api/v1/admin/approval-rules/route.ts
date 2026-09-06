import {
  listApprovalRules,
  createApprovalRule,
  approvalRuleSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler(
  { permission: "SETTINGS_MANAGE" },
  async () => {
    const rules = await listApprovalRules();
    return { data: rules };
  },
);

export const POST = protectedHandler<
  ReturnType<typeof approvalRuleSchema.parse>,
  undefined
>(
  { schema: approvalRuleSchema, permission: "SETTINGS_MANAGE" },
  async ({ input, user }) => {
    const created = await createApprovalRule(input, user.id);
    return { data: created, status: 201 };
  },
);
