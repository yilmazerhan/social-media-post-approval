import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReadinessItem } from "@/modules/posts";

/**
 * UI_UX_SPEC.md §4: deterministic, rule-based, no scoring or suggestions.
 * A failing item is a link that focuses the offending field — `onFocusField`
 * receives the item's key so the caller can move focus. The spec calls for
 * `aria-invalid` on failing items, but that attribute isn't valid on a
 * listitem or a plain button (only on form-widget roles) — an sr-only
 * "Passed:"/"Failed:" prefix carries the same information without an
 * invalid ARIA attribute an axe scan would flag.
 */
export function ReadinessChecklist({
  items,
  onFocusField,
}: {
  items: ReadinessItem[];
  onFocusField?: (key: ReadinessItem["key"]) => void;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">Submission readiness</h2>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            {item.passed ? (
              <Check className="text-success size-4 shrink-0" aria-hidden />
            ) : (
              <X className="text-destructive size-4 shrink-0" aria-hidden />
            )}
            <span className="sr-only">
              {item.passed ? "Passed: " : "Failed: "}
            </span>
            {item.passed || !onFocusField ? (
              <span className={cn(!item.passed && "text-destructive")}>
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onFocusField(item.key)}
                className="text-destructive text-left underline-offset-2 hover:underline"
              >
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-2 text-xs">
        Submit is enabled when all items pass.
      </p>
    </div>
  );
}
