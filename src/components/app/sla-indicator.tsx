import { AlertOctagon, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type SlaState = "on-track" | "warning" | "overdue";

function stateFor(percentElapsed: number): SlaState {
  if (percentElapsed >= 100) return "overdue";
  if (percentElapsed >= 75) return "warning";
  return "on-track";
}

const STATE_CONFIG = {
  "on-track": {
    icon: Clock,
    text: "text-success",
    bar: "bg-success",
  },
  warning: {
    icon: AlertTriangle,
    text: "text-warning",
    bar: "bg-warning",
  },
  overdue: {
    icon: AlertOctagon,
    text: "text-destructive",
    bar: "bg-destructive",
  },
} as const;

/** UI_UX_SPEC.md §2 — on-track/warning (>=75% elapsed)/overdue, always paired with a text remainder. */
export function SLAIndicator({
  percentElapsed,
  remainderText,
  className,
}: {
  percentElapsed: number;
  remainderText: string;
  className?: string;
}) {
  const state = stateFor(percentElapsed);
  const { icon: Icon, text, bar } = STATE_CONFIG[state];
  const clamped = Math.min(100, Math.max(0, percentElapsed));

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <Icon className={cn("size-4 shrink-0", text)} aria-hidden />
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="SLA elapsed"
        className="bg-muted h-2 w-24 overflow-hidden rounded-full"
      >
        <div
          className={cn("h-full rounded-full", bar)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className={cn("font-medium", text)}>{remainderText}</span>
    </div>
  );
}
