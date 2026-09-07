/**
 * The strict Tiptap JSON vocabulary this platform accepts — ADR-007
 * (ARCHITECTURE.md). Nothing outside this shape can reach the renderer in
 * content-render.ts, which is what actually neutralises hostile input: a
 * `link` mark's `href` must already be `http(s):`/`mailto:` before it is
 * ever rendered, and there is no node or mark type that can carry
 * arbitrary attributes, inline styles or script content.
 *
 * Every union here is a `z.discriminatedUnion` keyed on `type` rather than
 * a plain `z.union`: with a plain union, a value that matches no branch
 * makes Zod try *all* of them, and across `MAX_NESTING_DEPTH` levels of a
 * lazily-recursive schema that cost multiplies with depth instead of
 * adding to it — a 40-level adversarial payload turned into a
 * multi-gigabyte hang before this was a discriminated union. This mirrors
 * the extension set the client editor is configured with (see
 * components/app/editor/tiptap-config.ts).
 */
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

const MAX_NESTING_DEPTH = 32;

const linkMarkSchema = z.object({
  type: z.literal("link"),
  attrs: z.object({
    href: z
      .string()
      .refine(
        (href) => /^https?:\/\//i.test(href) || /^mailto:/i.test(href),
        "Links must use http, https or mailto.",
      ),
  }),
});

const simpleMarkSchema = z.object({
  type: z.enum(["bold", "italic", "underline", "strike"]),
});

const markSchema = z.discriminatedUnion("type", [
  simpleMarkSchema,
  linkMarkSchema,
]);

const textNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
  marks: z.array(markSchema).optional(),
});

const hardBreakNodeSchema = z.object({ type: z.literal("hardBreak") });

const inlineNodeSchema = z.discriminatedUnion("type", [
  textNodeSchema,
  hardBreakNodeSchema,
]);

interface BlockNode {
  type: string;
  content?: (BlockNode | InlineNode)[];
  attrs?: Record<string, unknown>;
}
type InlineNode = z.infer<typeof inlineNodeSchema>;

/** Depth-limited so a pathologically nested payload can't blow the stack when it's later rendered/walked. */
function blockNodeSchema(depth: number): z.ZodType<BlockNode> {
  if (depth > MAX_NESTING_DEPTH) {
    // A discriminatedUnion needs at least one member; a literal type that
    // can never occur in real input closes off recursion the same way
    // z.never() would.
    return z.object({
      type: z.literal("__max_depth_exceeded__"),
    }) as unknown as z.ZodType<BlockNode>;
  }

  const nested = z.lazy(() => blockNodeSchema(depth + 1));

  const paragraph = z.object({
    type: z.literal("paragraph"),
    content: z.array(inlineNodeSchema).optional(),
  });
  const blockquote = z.object({
    type: z.literal("blockquote"),
    content: z.array(nested).min(1),
  });
  const listItem = z.object({
    type: z.literal("listItem"),
    content: z.array(nested).min(1),
  });
  const bulletList = z.object({
    type: z.literal("bulletList"),
    content: z.array(listItem).min(1),
  });
  const orderedList = z.object({
    type: z.literal("orderedList"),
    attrs: z.object({ start: z.number().int().min(1).optional() }).optional(),
    content: z.array(listItem).min(1),
  });

  return z.discriminatedUnion("type", [
    paragraph,
    blockquote,
    bulletList,
    orderedList,
  ]) as unknown as z.ZodType<BlockNode>;
}

export const tiptapDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(blockNodeSchema(0)),
});

export type TiptapDocument = z.infer<typeof tiptapDocumentSchema>;

/** The document Tiptap's own `.getJSON()` returns for a brand-new, empty editor. */
export const EMPTY_DOCUMENT: TiptapDocument = { type: "doc", content: [] };

/**
 * A schema-validated `TiptapDocument` is already plain, JSON-serializable
 * data — this cast exists only because Prisma's generated `InputJsonValue`
 * type can't structurally match a Zod-inferred discriminated union.
 */
export function toJsonInput(doc: TiptapDocument): Prisma.InputJsonValue {
  return doc as unknown as Prisma.InputJsonValue;
}
