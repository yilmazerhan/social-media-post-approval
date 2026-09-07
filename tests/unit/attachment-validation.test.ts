import { describe, expect, it } from "vitest";
import {
  canonicalExtension,
  extensionMatchesMime,
  kindForMime,
  requireCanonicalExtension,
  sanitizeFilename,
} from "@/modules/attachments/validation";

describe("kindForMime", () => {
  it("classifies configured image types", () => {
    expect(kindForMime("image/jpeg")).toBe("IMAGE");
    expect(kindForMime("image/png")).toBe("IMAGE");
  });

  it("classifies configured video types", () => {
    expect(kindForMime("video/mp4")).toBe("VIDEO");
  });

  it("rejects SVG — CONFIGURATION.md: 'SVG is never allowed'", () => {
    expect(kindForMime("image/svg+xml")).toBeNull();
  });

  it("rejects an arbitrary/unlisted MIME type", () => {
    expect(kindForMime("application/x-msdownload")).toBeNull();
    expect(kindForMime("text/html")).toBeNull();
  });
});

describe("extensionMatchesMime", () => {
  it("accepts the canonical extension", () => {
    expect(extensionMatchesMime(".jpg", "image/jpeg")).toBe(true);
    expect(extensionMatchesMime(".png", "image/png")).toBe(true);
  });

  it("accepts a documented alternate extension", () => {
    expect(extensionMatchesMime(".jpeg", "image/jpeg")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(extensionMatchesMime(".JPG", "image/jpeg")).toBe(true);
  });

  it("rejects a mismatched extension — the crafted-file exit criterion", () => {
    expect(extensionMatchesMime(".png", "image/jpeg")).toBe(false);
    expect(extensionMatchesMime(".exe", "image/jpeg")).toBe(false);
  });

  it("rejects any extension for an unlisted MIME type", () => {
    expect(extensionMatchesMime(".svg", "image/svg+xml")).toBe(false);
  });
});

describe("canonicalExtension / requireCanonicalExtension", () => {
  it("returns the canonical extension for a known type", () => {
    expect(canonicalExtension("image/jpeg")).toBe(".jpg");
    expect(requireCanonicalExtension("video/webm")).toBe(".webm");
  });

  it("requireCanonicalExtension throws for an unknown type", () => {
    expect(() => requireCanonicalExtension("text/plain")).toThrow();
  });
});

describe("sanitizeFilename", () => {
  it("strips a path traversal payload down to a bare filename", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\windows\\system32\\evil.exe")).toBe(
      "evil.exe",
    );
  });

  it("replaces unsafe characters", () => {
    expect(sanitizeFilename("my photo (final)!.jpg")).toBe(
      "my_photo__final__.jpg",
    );
  });

  it("caps length and never returns empty", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("/")).toBe("file");
    expect(sanitizeFilename("a".repeat(500))).toHaveLength(200);
  });
});
