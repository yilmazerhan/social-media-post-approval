import {
  listSlaPolicies,
  createSlaPolicy,
  slaPolicySchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler(
  { permission: "SETTINGS_MANAGE" },
  async () => {
    const policies = await listSlaPolicies();
    return { data: policies };
  },
);

export const POST = protectedHandler<
  ReturnType<typeof slaPolicySchema.parse>,
  undefined
>(
  { schema: slaPolicySchema, permission: "SETTINGS_MANAGE" },
  async ({ input, user }) => {
    const created = await createSlaPolicy(input, user.id);
    return { data: created, status: 201 };
  },
);
