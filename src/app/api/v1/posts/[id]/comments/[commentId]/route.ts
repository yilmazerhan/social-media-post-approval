import { NextResponse } from "next/server";
import {
  updateCommentSchema,
  updateComment,
  deleteComment,
} from "@/modules/comments";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof updateCommentSchema.parse>,
  undefined
>({ schema: updateCommentSchema }, async ({ params, user, input }) => {
  const comment = await updateComment({
    postId: params.id,
    commentId: params.commentId,
    userId: user.id,
    input,
  });
  return { data: comment };
});

export const DELETE = protectedHandler<undefined, undefined>(
  {},
  async ({ params, user }) => {
    await deleteComment({
      postId: params.id,
      commentId: params.commentId,
      userId: user.id,
    });
    return { raw: new NextResponse(null, { status: 204 }) };
  },
);
