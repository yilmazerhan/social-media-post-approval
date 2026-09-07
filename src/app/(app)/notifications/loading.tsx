import { Skeleton } from "@/components/ui/skeleton";

/** UI_UX_SPEC.md §7 — matches the Notifications list layout. */
export default function NotificationsLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-40" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
