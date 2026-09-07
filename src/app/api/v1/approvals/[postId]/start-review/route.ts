import {
  startReview,
  loadApprovalActionResource,
  type ApprovalActionResource,
} from "@/modules/approvals";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler<undefined, ApprovalActionResource>(
  {
    permission: "POST_APPROVE",
    loadResource: ({ params }) => loadApprovalActionResource(params.postId),
  },
  async ({ params, user }) => {
    const result = await startReview({
      postId: params.postId,
      userId: user.id,
    });
    return { data: result };
  },
);
