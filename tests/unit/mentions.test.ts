import { describe, expect, it } from "vitest";
import { parseAndRenderComment } from "@/modules/comments";

const CANDIDATES = [
  { id: "u-jane", displayName: "Jane Manager" },
  { id: "u-jane-doe", displayName: "Jane" },
  { id: "u-john", displayName: "John Doe" },
];

describe("parseAndRenderComment", () => {
  it("escapes HTML in plain text", () => {
    const result = parseAndRenderComment("<script>alert(1)</script>", []);
    expect(result.bodyHtml).not.toContain("<script>");
    expect(result.bodyHtml).toContain("&lt;script&gt;");
    expect(result.mentionedUserIds).toEqual([]);
  });

  it("recognizes an exact mention and wraps it, without treating any other text as markup", () => {
    const result = parseAndRenderComment(
      "Hey @John Doe, can you take a look?",
      CANDIDATES,
    );
    expect(result.mentionedUserIds).toEqual(["u-john"]);
    expect(result.bodyHtml).toContain(
      '<strong class="mention">@John Doe</strong>',
    );
    expect(result.bodyHtml).toContain("can you take a look?");
  });

  it("prefers the longer overlapping name (Jane Manager over Jane)", () => {
    const result = parseAndRenderComment("cc @Jane Manager please", CANDIDATES);
    expect(result.mentionedUserIds).toEqual(["u-jane"]);
    expect(result.bodyHtml).toContain(
      '<strong class="mention">@Jane Manager</strong>',
    );
  });

  it("does not match a name that isn't a real candidate", () => {
    const result = parseAndRenderComment(
      "@Nobody Special is not real",
      CANDIDATES,
    );
    expect(result.mentionedUserIds).toEqual([]);
    expect(result.bodyHtml).not.toContain("mention");
  });

  it("de-duplicates repeated mentions of the same person", () => {
    const result = parseAndRenderComment(
      "@John Doe and again @John Doe",
      CANDIDATES,
    );
    expect(result.mentionedUserIds).toEqual(["u-john"]);
  });

  it("does not match a name followed by more word characters (word boundary)", () => {
    const result = parseAndRenderComment("@Janet is unrelated", [
      { id: "u-jane2", displayName: "Jane" },
    ]);
    expect(result.mentionedUserIds).toEqual([]);
  });
});
