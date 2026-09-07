import {
  listGroupMembers,
  addGroupMember,
  groupMemberSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler<undefined, undefined>(
  { permission: "GROUP_MANAGE" },
  async ({ params }) => {
    const members = await listGroupMembers(params.id);
    return { data: members };
  },
);

export const POST = protectedHandler<
  ReturnType<typeof groupMemberSchema.parse>,
  undefined
>(
  { schema: groupMemberSchema, permission: "GROUP_MANAGE" },
  async ({ params, input, user }) => {
    await addGroupMember(params.id, input.userId, user.id);
    return { data: { success: true }, status: 201 };
  },
);
