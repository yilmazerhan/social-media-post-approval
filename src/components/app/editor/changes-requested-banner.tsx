import { formatDistanceToNow } from "date-fns";
import { Undo2 } from "lucide-react";
import type { ChangesRequestedBanner as ChangesRequestedBannerData } from "@/modules/posts";

/** UI_UX_SPEC.md §4's CHANGES_REQUESTED banner. */
export function ChangesRequestedBanner({
  banner,
  onCompareVersions,
}: {
  banner: ChangesRequestedBannerData;
  onCompareVersions?: () => void;
}) {
  return (
    <div
      role="status"
      className="border-warning bg-warning/10 mb-4 rounded-md border p-3"
    >
      <p className="flex items-center gap-2 font-medium">
        <Undo2 className="text-warning size-4" aria-hidden />
        Changes requested on version {banner.versionNumber}
      </p>
      <blockquote className="mt-1 border-l-2 pl-3 text-sm italic">
        “{banner.comment}”
      </blockquote>
      <p className="text-muted-foreground mt-1 text-xs">
        — {banner.actorName},{" "}
        {formatDistanceToNow(new Date(banner.createdAt), { addSuffix: true })}
      </p>
      <p className="mt-2 text-sm">You are now creating a new version.</p>
      {onCompareVersions && (
        <button
          type="button"
          onClick={onCompareVersions}
          className="text-primary mt-1 text-sm underline-offset-2 hover:underline"
        >
          Compare versions
        </button>
      )}
    </div>
  );
}
