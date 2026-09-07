"use client";

import { useEffect } from "react";

const CONFIRM_MESSAGE = "You have unsaved changes. Leave anyway?";

/**
 * UI_UX_SPEC.md §4: "Unsaved changes guard on navigate-away and tab
 * close." Tab close/refresh is a real `beforeunload` prompt; in-app
 * navigation is guarded by intercepting clicks on same-origin links,
 * since the App Router has no built-in navigation blocker. Deliberately
 * out of scope: the browser back/forward buttons (`popstate`) — covering
 * every navigation vector needs more router plumbing than this phase's
 * value justifies; tab close and clicking away (by far the common cases)
 * are covered.
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    function onClickCapture(event: MouseEvent) {
      const anchor = (event.target as HTMLElement)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.getAttribute("target") === "_blank") return;

      if (!window.confirm(CONFIRM_MESSAGE)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [hasUnsavedChanges]);
}
