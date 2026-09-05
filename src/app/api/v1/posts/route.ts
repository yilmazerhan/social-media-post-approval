import { protectedHandler } from "@/server/http/handler";
import { createPostSchema, createDraft } from "@/modules/posts";

export const POST = protectedHandler(
  { schema: createPostSchema, permission: "POST_CREATE" },
  async ({ user, input }) => {
    const post = await createDraft({
      creatorId: user.id,
      creatorEmail: user.email,
      input,
    });
    return { data: post, status: 201 };
  },
);
