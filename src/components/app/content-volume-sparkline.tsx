import type { ContentVolumePoint } from "@/modules/posts";

/**
 * The admin dashboard's "content volume over time" glance tile
 * (UI_UX_SPEC.md §6). Deliberately not a chart-library visualisation —
 * that decision, and the "chart always paired with a data table" rule,
 * belongs to the Reports phase (Phase 14/15) which renders this same kind
 * of series at full detail with filters and CSV export. This is a small
 * bar sparkline with a plain-text total for screen readers, nothing more.
 */
export function ContentVolumeSparkline({
  points,
}: {
  points: ContentVolumePoint[];
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((sum, p) => sum + p.count, 0);

  return (
    <div>
      <div className="flex h-16 items-end gap-1" aria-hidden>
        {points.map((point) => (
          <div
            key={point.date}
            title={`${point.date}: ${point.count}`}
            className="bg-primary/70 min-h-1 flex-1 rounded-sm"
            style={{ height: `${Math.max(4, (point.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-sm">
        {total} post{total === 1 ? "" : "s"} submitted in the last{" "}
        {points.length} days.
      </p>
    </div>
  );
}
