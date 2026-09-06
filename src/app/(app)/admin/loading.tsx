import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7 — matches Administration's tab bar + table layout. */
export default function AdminLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-40" />
      <div className="mt-4 flex gap-2 border-b pb-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
