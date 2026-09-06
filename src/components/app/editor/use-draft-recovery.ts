"use client";

import { useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";

interface StashedDraft {
  title: string;
  content: JSONContent;
  savedAt: string;
}

function storageKey(postId: string): string {
  return `ca-draft-recovery-${postId}`;
}

function readStash(postId: string): StashedDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(postId));
    if (!raw) return null;
    return JSON.parse(raw) as StashedDraft;
  } catch {
    return null;
  }
}

/**
 * UI_UX_SPEC.md §4: "if the browser closed with unsaved local changes,
 * offer 'Restore unsaved changes from 14:22?' on reopen." This is a
 * narrower, faster-cadence safety net than the server's own draft record
 * (ADR-006) — it catches only the gap between the last successful
 * autosave and an unclean close (crash, or a save that failed).
 */
export function useDraftRecovery(params: {
  postId: string;
  serverDraftUpdatedAt: string | null;
}) {
  const { postId, serverDraftUpdatedAt } = params;
  const [recoverable, setRecoverable] = useState<StashedDraft | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    if (dismissed.current) return;
    const stash = readStash(postId);
    if (!stash) return;
    const stashTime = new Date(stash.savedAt).getTime();
    const serverTime = serverDraftUpdatedAt
      ? new Date(serverDraftUpdatedAt).getTime()
      : 0;
    if (stashTime > serverTime) {
      setRecoverable(stash);
    } else {
      window.localStorage.removeItem(storageKey(postId));
    }
    // Only evaluated once, at mount, against the draft the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stash(title: string, content: JSONContent) {
    try {
      window.localStorage.setItem(
        storageKey(postId),
        JSON.stringify({
          title,
          content,
          savedAt: new Date().toISOString(),
        } satisfies StashedDraft),
      );
    } catch {
      // Best-effort only — a full/blocked localStorage never breaks editing.
    }
  }

  function clearStash() {
    try {
      window.localStorage.removeItem(storageKey(postId));
    } catch {
      // Ignored — see stash().
    }
  }

  function dismiss() {
    dismissed.current = true;
    setRecoverable(null);
  }

  return { recoverable, stash, clearStash, dismiss };
}
