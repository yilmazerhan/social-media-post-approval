/**
 * Renders a (schema-validated) Tiptap document to HTML and plain text —
 * ADR-007's "sanitized HTML as a derivative". This never parses or trusts
 * an HTML string from anywhere; it only ever emits HTML it built itself,
 * tag by tag, from data content-schema.ts has already restricted to a
 * fixed vocabulary. There is nothing here for hostile input to reach:
 * text is always escaped, and a link's `href` was already protocol-
 * checked by the schema before this file ever sees it.
 */
import type { TiptapDocument } from "./content-schema";

interface AnyNode {
  type: string;
  text?: string;
  marks?: { type: string; attrs?: { href?: string } }[];
  content?: AnyNode[];
  attrs?: Record<string, unknown>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

const MARK_TAGS: Record<string, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
};

function renderInline(node: AnyNode): string {
  if (node.type === "hardBreak") return "<br>";
  if (node.type !== "text" || !node.text) return "";

  let html = escapeHtml(node.text);
  for (const mark of node.marks ?? []) {
    const tag = MARK_TAGS[mark.type];
    if (tag) {
      html = `<${tag}>${html}</${tag}>`;
    } else if (mark.type === "link" && mark.attrs?.href) {
      html = `<a href="${escapeAttr(mark.attrs.href)}" rel="noopener noreferrer nofollow">${html}</a>`;
    }
  }
  return html;
}

function renderInlineChildren(node: AnyNode): string {
  return (node.content ?? []).map(renderInline).join("");
}

function renderBlock(node: AnyNode): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderInlineChildren(node)}</p>`;
    case "blockquote":
      return `<blockquote>${(node.content ?? []).map(renderBlock).join("")}</blockquote>`;
    case "listItem":
      return `<li>${(node.content ?? []).map(renderBlock).join("")}</li>`;
    case "bulletList":
      return `<ul>${(node.content ?? []).map(renderBlock).join("")}</ul>`;
    case "orderedList": {
      const start =
        typeof node.attrs?.start === "number" && node.attrs.start !== 1
          ? ` start="${node.attrs.start}"`
          : "";
      return `<ol${start}>${(node.content ?? []).map(renderBlock).join("")}</ol>`;
    }
    default:
      return "";
  }
}

/** The sanitized HTML rendering stored on `PostVersion.contentHtml`. */
export function renderContentHtml(doc: TiptapDocument): string {
  return doc.content.map((node) => renderBlock(node as AnyNode)).join("");
}

function extractText(node: AnyNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const children = (node.content ?? []).map(extractText).join("");
  const isBlock =
    node.type === "paragraph" ||
    node.type === "listItem" ||
    node.type === "blockquote";
  return isBlock ? `${children}\n` : children;
}

/** Plain text for full-text search and diffing — `PostVersion.contentText`. */
export function extractPlainText(doc: TiptapDocument): string {
  return doc.content
    .map((node) => extractText(node as AnyNode))
    .join("")
    .trim();
}

export function countCharacters(text: string): number {
  return text.length;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}
