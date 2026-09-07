import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { ApprovalActionType } from "@/generated/prisma/client";

/**
 * Human labels for `ApprovalActionType` — shared by the employee dashboard's
 * recent-activity feed and (from Phase 10 on) the post details activity
 * timeline in UI_UX_SPEC.md §6, so the wording never drifts between them.
 */
export const ACTION_LABELS: Record<ApprovalActionType, string> = {
  SUBMIT: "submitted",
  ASSIGN: "assigned",
  START_REVIEW: "started reviewing",
  APPROVE: "approved",
  REJECT: "rejected",
  REQUEST_CHANGES: "requested changes on",
  RESUBMIT: "resubmitted",
  CANCEL: "cancelled",
  REASSIGN: "reassigned",
} as const;

export function ActivityItem({
  actorName,
  action,
  postTitle,
  postHref,
  createdAt,
}: {
  actorName: string;
  action: ApprovalActionType;
  postTitle: string;
  postHref: string;
  createdAt: Date;
}) {
  return (
    <li className="flex items-start justify-between gap-4 py-2 text-sm">
      <p className="min-w-0">
        <span className="font-medium">{actorName}</span>{" "}
        <span className="text-muted-foreground">{ACTION_LABELS[action]}</span>{" "}
        <Link href={postHref} className="truncate font-medium hover:underline">
          {postTitle}
        </Link>
      </p>
      <time
        dateTime={createdAt.toISOString()}
        className="text-muted-foreground shrink-0 whitespace-nowrap"
      >
        {formatDistanceToNow(createdAt, { addSuffix: true })}
      </time>
    </li>
  );
}
