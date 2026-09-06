import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import type { RoutePreview } from "@/modules/posts";

/** UI_UX_SPEC.md §4: "names the approval route, the version that will be created." */
export function SubmitConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  routePreview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  routePreview: RoutePreview | null;
}) {
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Submit for approval?"
      description={
        routePreview
          ? `This creates a new version and routes it to ${routePreview.assigneeName} via "${routePreview.ruleName}".`
          : "This creates a new version."
      }
      confirmLabel="Submit"
      onConfirm={onConfirm}
      isConfirming={isSubmitting}
    />
  );
}
