import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * UI_UX_SPEC.md §4: "renders the sanitized HTML exactly as the approver
 * will see it." `contentHtml` only ever comes from
 * `modules/posts/content-render.ts`'s own escaping renderer — this is the
 * one reviewed place SECURITY.md allows `dangerouslySetInnerHTML`.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  title,
  contentHtml,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  contentHtml: string;
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
      </DialogContent>
    </Dialog>
  );
}
