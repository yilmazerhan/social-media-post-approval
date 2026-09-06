import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7 — this route creates a draft and redirects; a light skeleton covers that brief round trip. */
export default function CreatePostLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
