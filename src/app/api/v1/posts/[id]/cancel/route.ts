import { prisma } from "@/server/db";
import { protectedHandler, WorkflowError } from "@/server/http/handler";
import { cancelPostSchema, cancelPost } from "@/modules/posts";

const CANCELLABLE_STATUSES = new Set(["DRAFT", "SUBMITTED"]);

export const POST = protectedHandler<
  ReturnType<typeof cancelPostSchema.parse>,
  { creatorId: string; status: string }
>(
  {
    schema: cancelPostSchema,
    permission: "POST_CANCEL",
    loadResource: async ({ params }) => {
      const post = await prisma.post.findUnique({
        where: { id: params.id },
        select: { creatorId: true, status: true },
      });
      if (!post) return null;
      return {
        resource: post,
        policyResource: { kind: "owned-post", creatorId: post.creatorId },
      };
    },
    workflowGuard: ({ resource }) => {
      if (!CANCELLABLE_STATUSES.has(resource.status)) {
        throw new WorkflowError(
          "Only a draft or a submitted, not-yet-reviewed post can be cancelled.",
          "INVALID_TRANSITION",
        );
      }
    },
  },
  async ({ params, user, input }) => {
    const result = await cancelPost({
      postId: params.id,
      userId: user.id,
      input,
    });
    return { data: result };
  },
);
