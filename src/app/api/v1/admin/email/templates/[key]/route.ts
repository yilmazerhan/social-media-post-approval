import {
  updateEmailTemplate,
  emailTemplateSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof emailTemplateSchema.parse>,
  undefined
>(
  { schema: emailTemplateSchema, permission: "EMAIL_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateEmailTemplate(params.key, input, user.id);
    return { data: updated };
  },
);
