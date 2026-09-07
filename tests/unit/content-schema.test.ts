import { describe, expect, it } from "vitest";
import { tiptapDocumentSchema } from "@/modules/posts";

function doc(content: unknown[]) {
  return { type: "doc", content };
}

describe("tiptapDocumentSchema", () => {
  it("accepts a plain paragraph with marks and a link", () => {
    const result = tiptapDocumentSchema.safeParse(
      doc([
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello ", marks: [{ type: "bold" }] },
            {
              type: "text",
              text: "world",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("accepts bullet lists, ordered lists and blockquotes", () => {
    const result = tiptapDocumentSchema.safeParse(
      doc([
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "one" }] },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 2 },
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "two" }] },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "quoted" }] },
          ],
        },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a node type outside the allowed vocabulary", () => {
    const result = tiptapDocumentSchema.safeParse(
      doc([{ type: "image", attrs: { src: "https://evil.example/x.png" } }]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a javascript: link href", () => {
    const result = tiptapDocumentSchema.safeParse(
      doc([
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click me",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a mark type outside the allowed vocabulary", () => {
    const result = tiptapDocumentSchema.safeParse(
      doc([
        {
          type: "paragraph",
          content: [
            { type: "text", text: "x", marks: [{ type: "highlight" }] },
          ],
        },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a pathologically deep nesting beyond the depth limit", () => {
    let node: unknown = {
      type: "paragraph",
      content: [{ type: "text", text: "leaf" }],
    };
    for (let i = 0; i < 40; i++) {
      node = {
        type: "blockquote",
        content: [node],
      };
    }
    const result = tiptapDocumentSchema.safeParse(doc([node]));
    expect(result.success).toBe(false);
  });

  it("accepts an empty document", () => {
    const result = tiptapDocumentSchema.safeParse(doc([]));
    expect(result.success).toBe(true);
  });
});
