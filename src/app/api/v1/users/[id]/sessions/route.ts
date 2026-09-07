import {
  listUserSessions,
  revokeAllSessionsForUser,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler<undefined, undefined>(
  { permission: "USER_MANAGE" },
  async ({ params }) => {
    const sessions = await listUserSessions(params.id);
    return { data: sessions };
  },
);

export const DELETE = protectedHandler<undefined, undefined>(
  { permission: "USER_MANAGE" },
  async ({ params, user }) => {
    await revokeAllSessionsForUser(params.id, user.id);
    return { data: { success: true } };
  },
);
