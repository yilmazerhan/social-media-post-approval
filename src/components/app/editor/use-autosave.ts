"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

const RETRY_DELAY_MS = 5000;

/** UI_UX_SPEC.md §4: autosave every N seconds of idle typing and on blur; the status chip is never silent. */
export function useAutosave(params: {
  title: string;
  content: JSONContent;
  intervalSeconds: number;
  enabled: boolean;
  onSave: (title: string, content: JSONContent) => Promise<void>;
}) {
  const { title, content, intervalSeconds, enabled, onSave } = params;
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);

  const latest = useRef({ title, content });
  latest.current = { title, content };
  // Seeded once, from whatever the editor first mounted with — the server's
  // own last-saved draft — so `dirty` starts false rather than flagging the
  // untouched initial load as an unsaved change.
  const savedSnapshot = useRef<string>(JSON.stringify({ title, content }));
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    setDirty(JSON.stringify(latest.current) !== savedSnapshot.current);
  }, [title, content]);

  const save = useCallback(async () => {
    const snapshot = JSON.stringify(latest.current);
    if (snapshot === savedSnapshot.current) return;
    setStatus("saving");
    try {
      await onSaveRef.current(latest.current.title, latest.current.content);
      savedSnapshot.current = snapshot;
      setDirty(false);
      setStatus("saved");
      setSavedAt(new Date());
    } catch {
      setStatus("error");
      retryTimer.current = setTimeout(save, RETRY_DELAY_MS);
    }
  }, []);

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void saveRef.current();
    }, intervalSeconds * 1000);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [title, content, intervalSeconds, enabled]);

  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  const saveNow = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    void save();
  }, [save]);

  return { status, savedAt, saveNow, dirty };
}
