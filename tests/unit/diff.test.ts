import { describe, expect, it } from "vitest";
import { computeWordDiff } from "@/lib/diff";

describe("computeWordDiff", () => {
  it("returns a single unchanged segment for identical text", () => {
    const result = computeWordDiff("hello world", "hello world");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      value: "hello world",
      added: false,
      removed: false,
    });
  });

  it("marks an inserted word as added", () => {
    const result = computeWordDiff("hello world", "hello brave world");
    expect(result.some((s) => s.added && s.value.includes("brave"))).toBe(true);
  });

  it("marks a deleted word as removed", () => {
    const result = computeWordDiff("hello brave world", "hello world");
    expect(result.some((s) => s.removed && s.value.includes("brave"))).toBe(
      true,
    );
  });

  it("handles a full replacement", () => {
    const result = computeWordDiff("the quick fox", "a slow turtle");
    expect(result.some((s) => s.removed)).toBe(true);
    expect(result.some((s) => s.added)).toBe(true);
  });

  it("handles empty strings", () => {
    expect(computeWordDiff("", "")).toEqual([]);
    expect(computeWordDiff("", "new text").some((s) => s.added)).toBe(true);
    expect(computeWordDiff("old text", "").some((s) => s.removed)).toBe(true);
  });
});
