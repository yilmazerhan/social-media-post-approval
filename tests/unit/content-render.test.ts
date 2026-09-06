import { describe, expect, it } from "vitest";
import {
  countCharacters,
  countWords,
  extractPlainText,
  renderContentHtml,
} from "@/modules/posts/content-render";
import type { TiptapDocument } from "@/modules/posts";

function doc(content: TiptapDocument["content"]): TiptapDocument {
  return { type: "doc", content };
}

describe("renderContentHtml", () => {
  it("escapes hostile text content instead of ever emitting it raw", () => {
    const html = renderContentHtml(
      doc([
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: '<script>alert("xss")</script>',
            },
          ],
        },
      ]),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes an attempted attribute breakout inside text", () => {
    const html = renderContentHtml(
      doc([
        {
          type: "paragraph",
          content: [{ type: "text", text: '"><img src=x onerror=alert(1)>' }],
        },
      ]),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("renders marks as their fixed tags, nested in application order", () => {
    const html = renderContentHtml(
      doc([
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "hi",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
          ],
        },
      ]),
    );
    expect(html).toBe("<p><em><strong>hi</strong></em></p>");
  });

  it("renders a link with a safe rel and escaped href", () => {
    const html = renderContentHtml(
      doc([
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/a?b=1&c=2" },
                },
              ],
            },
          ],
        },
      ]),
    );
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain("https://example.com/a?b=1&amp;c=2");
  });

  it("renders lists and blockquotes structurally", () => {
    const html = renderContentHtml(
      doc([
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "a" }] },
              ],
            },
          ],
        },
      ]),
    );
    expect(html).toBe("<ul><li><p>a</p></li></ul>");
  });

  it("renders an empty document as empty HTML", () => {
    expect(renderContentHtml(doc([]))).toBe("");
  });
});

describe("extractPlainText / countCharacters / countWords", () => {
  it("extracts readable plain text across paragraphs and lists", () => {
    const text = extractPlainText(
      doc([
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "item one" }],
                },
              ],
            },
          ],
        },
      ]),
    );
    expect(text).toContain("Hello world");
    expect(text).toContain("item one");
  });

  it("counts characters and words", () => {
    expect(countCharacters("Hello world")).toBe(11);
    expect(countWords("Hello   world  foo")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});
