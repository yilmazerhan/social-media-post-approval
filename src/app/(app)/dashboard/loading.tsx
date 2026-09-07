import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7 — a skeleton matching the final stat-card grid, never a bare spinner. */
export default function DashboardLoading() {
  return (
    <div>
      <Skeleton className="mb-6 h-8 w-40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-40 rounded-xl" />
    </div>
  );
}
