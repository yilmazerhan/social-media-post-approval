import {
  createCommentSchema,
  createComment,
  listComments,
} from "@/modules/comments";
import { protectedHandler } from "@/server/http/handler";

/** No `permission` option: `POST_COMMENT` is grant-only, so it alone can't confirm the caller may see THIS post — `listComments`/`createComment` enforce that themselves via `assertCanAccessPost`. */
export const GET = protectedHandler<undefined, undefined>(
  {},
  async ({ params, user }) => {
    const comments = await listComments(params.id, user.id);
    return { data: comments };
  },
);

export const POST = protectedHandler<
  ReturnType<typeof createCommentSchema.parse>,
  undefined
>({ schema: createCommentSchema }, async ({ params, user, input }) => {
  const comment = await createComment({
    postId: params.id,
    authorId: user.id,
    authorName: user.displayName,
    input,
  });
  return { data: comment, status: 201 };
});
