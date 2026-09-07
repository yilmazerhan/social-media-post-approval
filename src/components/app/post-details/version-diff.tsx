import type { DiffSegment } from "@/lib/diff";
import type { AttachmentDelta } from "@/modules/posts";

/**
 * UI_UX_SPEC.md §5: word-level diff rendered as additions (green,
 * underlined) and removals (red, struck through) — "with a legend,
 * because colour alone is not a signal." Shared by Post Details'
 * Versions tab (Phase 10) and Approval Review's Compare tab (Phase 14).
 */
export function VersionDiff({
  textDiff,
  attachmentDelta,
  titleChanged,
}: {
  textDiff: DiffSegment[];
  attachmentDelta: AttachmentDelta;
  titleChanged: boolean;
}) {
  const hasAttachmentChanges =
    attachmentDelta.added.length > 0 ||
    attachmentDelta.removed.length > 0 ||
    attachmentDelta.reordered;

  return (
    <div className="space-y-4">
      {(titleChanged || hasAttachmentChanges) && (
        <ul className="text-sm">
          {titleChanged && <li>Title changed.</li>}
          {attachmentDelta.added.length > 0 && (
            <li>{attachmentDelta.added.length} attachment(s) added.</li>
          )}
          {attachmentDelta.removed.length > 0 && (
            <li>{attachmentDelta.removed.length} attachment(s) removed.</li>
          )}
          {attachmentDelta.reordered && <li>Attachments reordered.</li>}
        </ul>
      )}

      <div className="flex items-center gap-4 text-xs">
        <span className="text-success flex items-center gap-1 underline decoration-2">
          Added
        </span>
        <span className="text-destructive flex items-center gap-1 line-through">
          Removed
        </span>
        <span className="text-muted-foreground">
          — colour is never the only signal
        </span>
      </div>

      <p className="rounded-md border p-4 text-sm leading-relaxed whitespace-pre-wrap">
        {textDiff.map((segment, index) => {
          if (segment.added) {
            return (
              <ins
                key={index}
                className="text-success bg-success/10 no-underline underline decoration-2"
              >
                {segment.value}
              </ins>
            );
          }
          if (segment.removed) {
            return (
              <del key={index} className="text-destructive bg-destructive/10">
                {segment.value}
              </del>
            );
          }
          return <span key={index}>{segment.value}</span>;
        })}
      </p>

      {(attachmentDelta.added.length > 0 ||
        attachmentDelta.removed.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {attachmentDelta.added.map((attachment) => (
            <AttachmentDeltaThumb
              key={attachment.id}
              attachment={attachment}
              label="Added"
            />
          ))}
          {attachmentDelta.removed.map((attachment) => (
            <AttachmentDeltaThumb
              key={attachment.id}
              attachment={attachment}
              label="Removed"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentDeltaThumb({
  attachment,
  label,
}: {
  attachment: { id: string; originalFilename: string; hasThumbnail: boolean };
  label: "Added" | "Removed";
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="bg-muted size-16 overflow-hidden rounded-md border">
        {attachment.hasThumbnail && (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated, non-static endpoint.
          <img
            src={`/api/v1/attachments/${attachment.id}/thumbnail`}
            alt={attachment.originalFilename}
            className="size-full object-cover"
          />
        )}
      </div>
      <span
        className={
          label === "Added"
            ? "text-success text-xs"
            : "text-destructive text-xs"
        }
      >
        {label}
      </span>
    </div>
  );
}
