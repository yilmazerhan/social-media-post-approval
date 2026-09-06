"use client";

import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  RemoveFormatting,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ToolbarButtonConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const BUTTONS: ToolbarButtonConfig[] = [
  {
    key: "bold",
    label: "Bold",
    icon: Bold,
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    key: "italic",
    label: "Italic",
    icon: Italic,
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    key: "underline",
    label: "Underline",
    icon: Underline,
    isActive: (e) => e.isActive("underline"),
    run: (e) => e.chain().focus().toggleUnderline().run(),
  },
  {
    key: "blockquote",
    label: "Blockquote",
    icon: Quote,
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: "bulletList",
    label: "Bullet list",
    icon: List,
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: "orderedList",
    label: "Numbered list",
    icon: ListOrdered,
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
];

/** UI_UX_SPEC.md §4: "a proper toolbar widget with arrow-key navigation and announced button states." */
export function EditorToolbar({ editor }: { editor: Editor }) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  const activeStates = useEditorState({
    editor,
    selector: ({ editor }) => ({
      states: BUTTONS.map((button) => button.isActive(editor)),
      linkActive: editor.isActive("link"),
      canClear: !editor.state.selection.empty,
    }),
  });

  const totalButtons = BUTTONS.length + 2; // + link + clear formatting

  function focusButton(index: number) {
    const wrapped = (index + totalButtons) % totalButtons;
    buttonRefs.current[wrapped]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusButton(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusButton(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusButton(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusButton(totalButtons - 1);
    }
  }

  function openLinkInput() {
    const existing = editor.getAttributes("link").href as string | undefined;
    setLinkValue(existing ?? "");
    setLinkInputOpen(true);
  }

  function applyLink() {
    const href = linkValue.trim();
    if (href === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href }).run();
    }
    setLinkInputOpen(false);
  }

  return (
    <div className="border-b">
      <div
        role="toolbar"
        aria-label="Formatting"
        aria-orientation="horizontal"
        className="flex flex-wrap items-center gap-0.5 p-1"
      >
        {BUTTONS.map((button, index) => (
          <Button
            key={button.key}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            variant="ghost"
            size="icon"
            tabIndex={index === 0 ? 0 : -1}
            aria-label={button.label}
            aria-pressed={activeStates.states[index]}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onClick={() => button.run(editor)}
            className={cn(activeStates.states[index] && "bg-accent")}
          >
            <button.icon aria-hidden />
          </Button>
        ))}
        <Button
          ref={(el) => {
            buttonRefs.current[BUTTONS.length] = el;
          }}
          type="button"
          variant="ghost"
          size="icon"
          tabIndex={-1}
          aria-label="Link"
          aria-pressed={activeStates.linkActive}
          onKeyDown={(e) => handleKeyDown(BUTTONS.length, e)}
          onClick={openLinkInput}
          className={cn(activeStates.linkActive && "bg-accent")}
        >
          <LinkIcon aria-hidden />
        </Button>
        <Button
          ref={(el) => {
            buttonRefs.current[BUTTONS.length + 1] = el;
          }}
          type="button"
          variant="ghost"
          size="icon"
          tabIndex={-1}
          aria-label="Clear formatting"
          disabled={!activeStates.canClear}
          onKeyDown={(e) => handleKeyDown(BUTTONS.length + 1, e)}
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
        >
          <RemoveFormatting aria-hidden />
        </Button>
      </div>
      {linkInputOpen && (
        <form
          className="flex items-center gap-2 border-t p-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <Input
            autoFocus
            type="url"
            placeholder="https://example.com"
            aria-label="Link URL"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setLinkInputOpen(false);
            }}
            className="h-8"
          />
          <Button type="submit" size="sm">
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setLinkInputOpen(false)}
          >
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
