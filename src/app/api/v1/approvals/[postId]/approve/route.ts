import {
  approveSchema,
  approvePost,
  loadApprovalActionResource,
  type ApprovalActionResource,
} from "@/modules/approvals";
import { protectedHandler, WorkflowError } from "@/server/http/handler";

export const POST = protectedHandler<
  ReturnType<typeof approveSchema.parse>,
  ApprovalActionResource
>(
  {
    schema: approveSchema,
    permission: "POST_APPROVE",
    loadResource: ({ params }) => loadApprovalActionResource(params.postId),
    workflowGuard: ({ resource }) => {
      if (resource.status !== "IN_REVIEW") {
        throw new WorkflowError(
          "Only a post under review can be approved.",
          "INVALID_TRANSITION",
        );
      }
    },
  },
  async ({ params, user, input }) => {
    const result = await approvePost({
      postId: params.postId,
      userId: user.id,
      input,
    });
    return { data: result };
  },
);
