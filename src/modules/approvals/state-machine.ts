/**
 * The one legal-transition table ARCHITECTURE.md §4 describes ("a single
 * table of legal (fromStatus, action, toStatus) triples... `posts` and
 * `approvals` both call it; there is no second path") and CLAUDE.md
 * repeats as a house rule. Transcribed from that section's diagram.
 *
 * Phase 8 only ever drives the SUBMIT/RESUBMIT rows (via
 * `modules/posts/submit.ts`); the rest exist here as data now so Phase 11
 * adds their guards and executors to this same table instead of a second
 * one. Editing an APPROVED post back to DRAFT is deliberately not a row
 * here — it isn't one of `ApprovalActionType`'s nine values, and Phase 10
 * owns that mechanism.
 */
import type { ApprovalActionType, PostStatus } from "@/generated/prisma/client";
import { WorkflowError } from "@/server/http/handler";

interface Transition {
  from: PostStatus;
  action: ApprovalActionType;
  to: PostStatus;
}

const TRANSITIONS: readonly Transition[] = [
  { from: "DRAFT", action: "SUBMIT", to: "SUBMITTED" },
  { from: "DRAFT", action: "CANCEL", to: "CANCELLED" },
  { from: "SUBMITTED", action: "CANCEL", to: "CANCELLED" },
  { from: "SUBMITTED", action: "START_REVIEW", to: "IN_REVIEW" },
  { from: "IN_REVIEW", action: "APPROVE", to: "APPROVED" },
  { from: "IN_REVIEW", action: "REJECT", to: "REJECTED" },
  { from: "IN_REVIEW", action: "REQUEST_CHANGES", to: "CHANGES_REQUESTED" },
  { from: "CHANGES_REQUESTED", action: "RESUBMIT", to: "SUBMITTED" },
];

/** Read-only view of the legal-transition table, for the admin "Workflow" section (API.md's `GET /admin/workflow-transitions`) — never a second source of truth, just a listing of this one. */
export function listTransitions(): readonly Transition[] {
  return TRANSITIONS;
}

/** Returns the resulting status, or throws `WorkflowError("INVALID_TRANSITION")` if the pair isn't in the table. */
export function assertLegalTransition(
  from: PostStatus,
  action: ApprovalActionType,
): PostStatus {
  const transition = TRANSITIONS.find(
    (t) => t.from === from && t.action === action,
  );
  if (!transition) {
    throw new WorkflowError(
      `${action} is not a legal transition from ${from}.`,
      "INVALID_TRANSITION",
    );
  }
  return transition.to;
}
