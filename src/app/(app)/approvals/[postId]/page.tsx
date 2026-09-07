import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { loadAuthorizedUser, can } from "@/modules/authorization";
import {
  loadApprovalReadResource,
  getApprovalReviewPayload,
  startReview,
} from "@/modules/approvals";
import { ApprovalReviewView } from "@/components/app/approvals/approval-review-view";

export const metadata: Metadata = {
  title: "Approval Review — Content Approval",
};

export default async function ApprovalReviewPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) redirect("/login");

  const authz = await loadAuthorizedUser(sessionContext.user.id);
  const resource = await loadApprovalReadResource(postId);
  if (!resource || !can(authz, "APPROVAL_READ", resource.policyResource)) {
    notFound();
  }

  let payload = await getApprovalReviewPayload(postId, authz);
  if (!payload) notFound();

  // API.md documents start-review as idempotent precisely so opening the
  // review screen can trigger it directly — only for the actual assignee
  // (canDecide), never a department peer merely reading the post, and
  // only from SUBMITTED (a repeat open of an already IN_REVIEW post is a
  // no-op inside startReview itself).
  if (
    payload.header.capabilities.canDecide &&
    payload.header.status === "SUBMITTED"
  ) {
    await startReview({ postId, userId: sessionContext.user.id });
    payload = await getApprovalReviewPayload(postId, authz);
    if (!payload) notFound();
  }

  return <ApprovalReviewView initialPayload={payload} />;
}
