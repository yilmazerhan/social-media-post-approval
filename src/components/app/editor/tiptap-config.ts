import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import type { Extensions } from "@tiptap/core";

/**
 * The editor's extension set — deliberately a subset of StarterKit,
 * chosen to match the fixed node/mark vocabulary
 * `modules/posts/content-schema.ts` accepts server-side (no headings, code
 * blocks or horizontal rules — UI_UX_SPEC.md §4's toolbar doesn't offer
 * them, and a smaller schema is a smaller attack surface). A conformance
 * test keeps the two from drifting apart.
 */
export function createEditorExtensions(options: {
  placeholder: string;
  characterLimit: number;
}): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      code: false,
      heading: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        autolink: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      },
    }),
    Placeholder.configure({ placeholder: options.placeholder }),
    CharacterCount.configure({ limit: options.characterLimit }),
  ];
}
