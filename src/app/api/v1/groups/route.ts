import { listGroups, createGroup, groupSchema } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler({}, async () => {
  const groups = await listGroups();
  return { data: groups };
});

export const POST = protectedHandler<
  ReturnType<typeof groupSchema.parse>,
  undefined
>(
  { schema: groupSchema, permission: "GROUP_MANAGE" },
  async ({ input, user }) => {
    const created = await createGroup(input, user.id);
    return { data: created, status: 201 };
  },
);
