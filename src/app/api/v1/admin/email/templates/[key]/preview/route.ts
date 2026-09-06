import {
  previewEmailTemplate,
  emailTemplatePreviewSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler<
  ReturnType<typeof emailTemplatePreviewSchema.parse>,
  undefined
>(
  { schema: emailTemplatePreviewSchema, permission: "EMAIL_MANAGE" },
  async ({ params, input }) => {
    const rendered = await previewEmailTemplate(params.key, input.variables);
    return { data: rendered };
  },
);
