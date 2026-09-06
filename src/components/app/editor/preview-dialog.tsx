import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AttachmentDto } from "@/modules/attachments";

/**
 * UI_UX_SPEC.md §4: "renders the sanitized HTML exactly as the approver
 * will see it ... with the media gallery." `contentHtml` only ever comes
 * from `modules/posts/content-render.ts`'s own escaping renderer — this is
 * the one reviewed place SECURITY.md allows `dangerouslySetInnerHTML`.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  title,
  contentHtml,
  attachments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  contentHtml: string;
  attachments: AttachmentDto[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title || "Untitled post"}</DialogTitle>
        </DialogHeader>
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
        {attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="bg-muted size-24 overflow-hidden rounded-md border"
              >
                {attachment.hasThumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated, non-static endpoint; next/image can't proxy it.
                  <img
                    src={`/api/v1/attachments/${attachment.id}/thumbnail`}
                    alt={attachment.originalFilename}
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
