import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7 — matches Post Details' header + tabbed content layout. */
export default function PostDetailsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="mt-4 flex gap-4 border-b pb-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="mt-4 h-72 rounded-xl" />
    </div>
  );
}
