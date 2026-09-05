import { prisma } from "@/server/db";
import { protectedHandler, WorkflowError } from "@/server/http/handler";
import { autosavePostSchema, autosaveDraft } from "@/modules/posts";

const EDITABLE_STATUSES = new Set(["DRAFT", "CHANGES_REQUESTED", "APPROVED"]);

export const POST = protectedHandler<
  ReturnType<typeof autosavePostSchema.parse>,
  { creatorId: string; status: string }
>(
  {
    schema: autosavePostSchema,
    permission: "POST_EDIT_OWN",
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
      if (!EDITABLE_STATUSES.has(resource.status)) {
        throw new WorkflowError(
          "This post can no longer be edited.",
          "INVALID_TRANSITION",
        );
      }
    },
  },
  async ({ params, input }) => {
    const result = await autosaveDraft({ postId: params.id, input });
    return { data: result };
  },
);
