import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7/§4 — matches the Post Editor's title bar + two-column (content, settings) layout. */
export default function EditPostLoading() {
  return (
    <div>
      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <Skeleton className="h-6 w-56" />
        <div className="hidden gap-2 lg:flex">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 rounded-md" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
