import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** UI_UX_SPEC.md §7 — icon, one-line explanation, and the action that resolves it. */
export function EmptyState({
  icon: Icon,
  title,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 py-12 text-center",
        className,
      )}
    >
      <Icon className="text-muted-foreground size-8" aria-hidden />
      <p className="text-muted-foreground text-sm">{title}</p>
      {action}
    </div>
  );
}
