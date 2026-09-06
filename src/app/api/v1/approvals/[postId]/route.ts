import {
  loadApprovalReadResource,
  getApprovalReviewPayload,
} from "@/modules/approvals";
import { protectedHandler } from "@/server/http/handler";
import { jsonError } from "@/server/http/envelope";

/** API.md: "review payload: post, version under review, previous version, diff, history, SLA, comments." */
export const GET = protectedHandler<undefined, { postId: string }>(
  {
    permission: "APPROVAL_READ",
    loadResource: ({ params }) => loadApprovalReadResource(params.postId),
  },
  async ({ params, authz }) => {
    const payload = await getApprovalReviewPayload(params.postId, authz);
    if (!payload) {
      return { raw: jsonError(404, "NOT_FOUND", "Not found.") };
    }
    return { data: payload };
  },
);
