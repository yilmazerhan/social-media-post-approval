import { prisma } from "@/server/db";
import { protectedHandler, WorkflowError } from "@/server/http/handler";
import { updatePostSchema, getPostForEdit, updateDraft } from "@/modules/posts";

const EDITABLE_STATUSES = new Set(["DRAFT", "CHANGES_REQUESTED", "APPROVED"]);

async function loadOwnedPost({ params }: { params: Record<string, string> }) {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    select: { creatorId: true, status: true },
  });
  if (!post) return null;
  return {
    resource: post,
    policyResource: { kind: "owned-post" as const, creatorId: post.creatorId },
  };
}

export const GET = protectedHandler<
  undefined,
  { creatorId: string; status: string }
>(
  { permission: "POST_READ_OWN", loadResource: loadOwnedPost },
  async ({ params, user }) => {
    const dto = await getPostForEdit(params.id, user.id);
    return { data: dto };
  },
);

export const PATCH = protectedHandler<
  ReturnType<typeof updatePostSchema.parse>,
  { creatorId: string; status: string }
>(
  {
    schema: updatePostSchema,
    permission: "POST_EDIT_OWN",
    loadResource: loadOwnedPost,
    workflowGuard: ({ resource }) => {
      if (!EDITABLE_STATUSES.has(resource.status)) {
        throw new WorkflowError(
          "This post can no longer be edited.",
          "INVALID_TRANSITION",
        );
      }
    },
  },
  async ({ params, input, resource }) => {
    const result = await updateDraft({
      postId: params.id,
      creatorId: resource.creatorId,
      input,
    });
    return { data: result };
  },
);
