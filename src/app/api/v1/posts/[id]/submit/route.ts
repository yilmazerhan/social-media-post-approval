import { prisma } from "@/server/db";
import { protectedHandler, WorkflowError } from "@/server/http/handler";
import { submitPostSchema, submitPost } from "@/modules/posts";

const SUBMITTABLE_STATUSES = new Set(["DRAFT", "CHANGES_REQUESTED"]);

export const POST = protectedHandler<
  ReturnType<typeof submitPostSchema.parse>,
  { creatorId: string; status: string }
>(
  {
    schema: submitPostSchema,
    permission: "POST_SUBMIT",
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
      if (!SUBMITTABLE_STATUSES.has(resource.status)) {
        throw new WorkflowError(
          "Only a draft or a post with changes requested can be submitted.",
          "INVALID_TRANSITION",
        );
      }
    },
  },
  async ({ params, input }) => {
    const result = await submitPost({ postId: params.id, input });
    return { data: result };
  },
);
