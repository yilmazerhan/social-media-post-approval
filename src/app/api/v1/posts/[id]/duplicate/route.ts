import { prisma } from "@/server/db";
import { protectedHandler } from "@/server/http/handler";
import { duplicatePost } from "@/modules/posts";
import { ForbiddenError } from "@/modules/authorization";

/**
 * API.md's `POST /:id/duplicate` — permission `POST_CREATE`. That alone
 * would let anyone who can create a post duplicate any other post by id;
 * duplicating necessarily reads the source's content first, so this also
 * requires the same read access every other read on a post does (owner,
 * or `POST_READ_ALL`) — enforced in `workflowGuard` since `POST_CREATE`
 * isn't one of `can()`'s ownership-scoped permissions.
 */
export const POST = protectedHandler<undefined, { creatorId: string }>(
  {
    permission: "POST_CREATE",
    loadResource: async ({ params }) => {
      const post = await prisma.post.findUnique({
        where: { id: params.id },
        select: { creatorId: true },
      });
      if (!post) return null;
      return { resource: post, policyResource: undefined };
    },
    workflowGuard: ({ user, authz, resource }) => {
      if (
        resource.creatorId !== user.id &&
        !authz.permissions.has("POST_READ_ALL")
      ) {
        throw new ForbiddenError("POST_READ_ALL");
      }
    },
  },
  async ({ params, user }) => {
    const post = await duplicatePost({
      sourcePostId: params.id,
      creatorId: user.id,
      creatorEmail: user.email,
    });
    return { data: post, status: 201 };
  },
);
