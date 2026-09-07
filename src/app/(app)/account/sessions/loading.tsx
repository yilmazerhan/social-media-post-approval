import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7 — matches the Sessions list layout. */
export default function SessionsLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-32" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
