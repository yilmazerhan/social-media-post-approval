import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * UI_UX_SPEC.md §7 — what happened, what to do, and a Retry action.
 * `traceId` (if present) is shown in small type so a user can quote it to
 * support; never a stack trace, SQL, or anything else server-internal.
 */
export function ErrorState({
  message,
  traceId,
  onRetry,
  className,
}: {
  message: string;
  traceId?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 py-12 text-center",
        className,
      )}
    >
      <AlertOctagon className="text-destructive size-8" aria-hidden />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
      {traceId && (
        <p className="text-muted-foreground text-xs">Reference: {traceId}</p>
      )}
    </div>
  );
}
