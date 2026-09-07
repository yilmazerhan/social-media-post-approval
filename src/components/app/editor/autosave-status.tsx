import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutosaveStatus } from "./use-autosave";

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** UI_UX_SPEC.md §4/§9: an `aria-live="polite"` chip that is never silent about autosave state. */
export function AutosaveStatusChip({
  status,
  savedAt,
}: {
  status: AutosaveStatus;
  savedAt: Date | null;
}) {
  const content = (() => {
    switch (status) {
      case "saving":
        return (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Saving…
          </>
        );
      case "saved":
        return (
          <>
            <CheckCircle2 className="text-success size-3.5" aria-hidden />
            Saved{savedAt ? ` ${formatTime(savedAt)}` : ""}
          </>
        );
      case "error":
        return (
          <>
            <AlertTriangle className="text-destructive size-3.5" aria-hidden />
            Save failed — retrying
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <span
      aria-live="polite"
      className={cn(
        "text-muted-foreground flex items-center gap-1.5 text-xs",
        status === "error" && "text-destructive",
      )}
    >
      {content}
    </span>
  );
}
