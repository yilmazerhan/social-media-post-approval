import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7 — matches Reports' stat-card row + chart layout. */
export default function ReportsLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-32" />
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-80 rounded-xl" />
    </div>
  );
}
