import {
  requestChangesSchema,
  requestChanges,
  loadApprovalActionResource,
  type ApprovalActionResource,
} from "@/modules/approvals";
import { protectedHandler, WorkflowError } from "@/server/http/handler";

export const POST = protectedHandler<
  ReturnType<typeof requestChangesSchema.parse>,
  ApprovalActionResource
>(
  {
    schema: requestChangesSchema,
    permission: "POST_REQUEST_CHANGES",
    loadResource: ({ params }) => loadApprovalActionResource(params.postId),
    workflowGuard: ({ resource }) => {
      if (resource.status !== "IN_REVIEW") {
        throw new WorkflowError(
          "Only a post under review can have changes requested.",
          "INVALID_TRANSITION",
        );
      }
    },
  },
  async ({ params, user, input }) => {
    const result = await requestChanges({
      postId: params.postId,
      userId: user.id,
      input,
    });
    return { data: result };
  },
);
