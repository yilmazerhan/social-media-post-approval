import {
  adminResetPassword,
  adminResetPasswordSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

/** LOCAL only — `409 PROVIDER_MISMATCH` for an Entra account (API.md). */
export const POST = protectedHandler<
  ReturnType<typeof adminResetPasswordSchema.parse>,
  undefined
>(
  { schema: adminResetPasswordSchema, permission: "USER_MANAGE" },
  async ({ params, input, user }) => {
    await adminResetPassword(params.id, input.newPassword, user.id);
    return { data: { success: true } };
  },
);
