"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { createEditorExtensions } from "./tiptap-config";
import { EditorToolbar } from "./toolbar";
import { cn } from "@/lib/utils";

export interface RichTextEditorProps {
  content: JSONContent;
  onChange: (content: JSONContent) => void;
  characterLimit: number;
  placeholder?: string;
  editable?: boolean;
  /** Fires on blur, in addition to onChange — the editor's own autosave-on-blur trigger. */
  onBlur?: () => void;
}

/** UI_UX_SPEC.md §4's Tiptap editor — the client half of ADR-007. */
export function RichTextEditor({
  content,
  onChange,
  characterLimit,
  placeholder = "Write your post…",
  editable = true,
  onBlur,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: createEditorExtensions({ placeholder, characterLimit }),
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Post content",
        "aria-multiline": "true",
        class: "prose prose-sm max-w-none focus:outline-none min-h-40 p-3",
      },
    },
  });

  useEffect(() => {
    return () => editor?.destroy();
  }, [editor]);

  const characterCount =
    useEditorState({
      editor,
      selector: ({ editor }) =>
        editor ? editor.storage.characterCount.characters() : 0,
    }) ?? 0;

  if (!editor) return null;

  const overLimit = characterCount > characterLimit;

  return (
    <div className="rounded-md border">
      {editable && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
      <div
        className={cn(
          "text-muted-foreground border-t px-3 py-1.5 text-right text-xs",
          overLimit && "text-destructive font-medium",
        )}
      >
        {characterCount}/{characterLimit}
      </div>
    </div>
  );
}
