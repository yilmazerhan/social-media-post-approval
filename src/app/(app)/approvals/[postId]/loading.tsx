import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7/§5 — matches Approval Review's header + two-column (content, decision panel) layout. */
export default function ApprovalReviewLoading() {
  return (
    <div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
