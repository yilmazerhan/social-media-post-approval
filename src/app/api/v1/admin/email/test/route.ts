import { sendTestEmailSchema, sendTestEmail } from "@/modules/email";
import { protectedHandler } from "@/server/http/handler";

/** API.md's `POST /admin/email/test` — sends a one-off test message through the real SMTP pipeline, queued and logged like any other email. */
export const POST = protectedHandler<
  ReturnType<typeof sendTestEmailSchema.parse>,
  undefined
>(
  { schema: sendTestEmailSchema, permission: "EMAIL_MANAGE" },
  async ({ input }) => {
    await sendTestEmail(input.to);
    return { data: { success: true }, status: 202 };
  },
);
