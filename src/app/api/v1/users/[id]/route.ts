import {
  getUserDetail,
  updateUser,
  updateUserSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler<undefined, undefined>(
  { permission: "USER_READ" },
  async ({ params }) => {
    const detail = await getUserDetail(params.id);
    return { data: detail };
  },
);

export const PATCH = protectedHandler<
  ReturnType<typeof updateUserSchema.parse>,
  undefined
>(
  { schema: updateUserSchema, permission: "USER_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateUser(params.id, input, user.id);
    return { data: updated };
  },
);
