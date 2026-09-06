import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7 — matches the Approval Queue's filter bar + table layout. */
export default function ApprovalsLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-32" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
