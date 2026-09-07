import {
  rejectSchema,
  rejectPost,
  loadApprovalActionResource,
  type ApprovalActionResource,
} from "@/modules/approvals";
import { protectedHandler, WorkflowError } from "@/server/http/handler";

export const POST = protectedHandler<
  ReturnType<typeof rejectSchema.parse>,
  ApprovalActionResource
>(
  {
    schema: rejectSchema,
    permission: "POST_REJECT",
    loadResource: ({ params }) => loadApprovalActionResource(params.postId),
    workflowGuard: ({ resource }) => {
      if (resource.status !== "IN_REVIEW") {
        throw new WorkflowError(
          "Only a post under review can be rejected.",
          "INVALID_TRANSITION",
        );
      }
    },
  },
  async ({ params, user, input }) => {
    const result = await rejectPost({
      postId: params.postId,
      userId: user.id,
      input,
    });
    return { data: result };
  },
);
