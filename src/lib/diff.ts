/**
 * Word-level diff — UI_UX_SPEC.md §5: "word-level diff over the extracted
 * plain text, rendered as additions (green, underlined) and removals
 * (red, struck through)". Used by both the Post Details Versions tab
 * (Phase 10) and Approval Review's Compare tab (Phase 14) — one function,
 * not two.
 */
import { diffWords, type Change } from "diff";

export interface DiffSegment {
  value: string;
  added: boolean;
  removed: boolean;
}

/** Pure and synchronous — a plain data transform, unit-testable without any I/O. */
export function computeWordDiff(
  fromText: string,
  toText: string,
): DiffSegment[] {
  const changes: Change[] = diffWords(fromText, toText);
  return changes.map((change) => ({
    value: change.value,
    added: change.added ?? false,
    removed: change.removed ?? false,
  }));
}
