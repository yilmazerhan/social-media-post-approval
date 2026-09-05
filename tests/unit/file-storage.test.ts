import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LocalFileStorage,
  PathEscapeError,
  generateStorageKey,
  resolveStorageKey,
  withKeySuffix,
} from "@/modules/attachments/file-storage";

/**
 * ARCHITECTURE.md §6: keys are opaque and resolved against a root "with a
 * normalised-path check that rejects anything escaping the root" —
 * SECURITY.md's path-traversal control. These crafted `../` payloads are
 * exactly the exit-criterion case for Phase 9.
 */
describe("resolveStorageKey", () => {
  it("resolves an ordinary key under the root", () => {
    const resolved = resolveStorageKey("/data/uploads", "2026/09/abc.jpg");
    expect(resolved).toBe(path.resolve("/data/uploads/2026/09/abc.jpg"));
  });

  it("rejects a key that escapes the root via ../", () => {
    expect(() =>
      resolveStorageKey("/data/uploads", "../../etc/passwd"),
    ).toThrow(PathEscapeError);
  });

  it("rejects a key that escapes via an absolute path", () => {
    expect(() => resolveStorageKey("/data/uploads", "/etc/passwd")).toThrow(
      PathEscapeError,
    );
  });

  it("rejects a key smuggling traversal after a valid-looking prefix", () => {
    expect(() =>
      resolveStorageKey("/data/uploads", "2026/09/../../../etc/passwd"),
    ).toThrow(PathEscapeError);
  });
});

describe("generateStorageKey", () => {
  it("produces an opaque {yyyy}/{mm}/{uuid}{ext} key", () => {
    const key = generateStorageKey(".jpg");
    expect(key).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
  });
});

describe("withKeySuffix", () => {
  it("inserts a suffix before the extension", () => {
    expect(withKeySuffix("2026/09/abc.jpg", "-thumb")).toBe(
      "2026/09/abc-thumb.jpg",
    );
  });

  it("can also override the extension", () => {
    expect(withKeySuffix("2026/09/abc.mp4", "-poster", ".jpg")).toBe(
      "2026/09/abc-poster.jpg",
    );
  });
});

describe("LocalFileStorage", () => {
  let root: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "ca-storage-test-"));
    storage = new LocalFileStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("saves, reads, stats, checks existence and deletes a file", async () => {
    const key = "2026/09/test.txt";
    const content = Buffer.from("hello world");

    const saved = await storage.save({ key, data: Readable.from(content) });
    expect(saved.byteSize).toBe(content.byteLength);

    expect(await storage.exists(key)).toBe(true);

    const stat = await storage.stat(key);
    expect(stat.byteSize).toBe(content.byteLength);

    const chunks: Buffer[] = [];
    for await (const chunk of await storage.read(key)) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString()).toBe("hello world");

    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it("creates intermediate directories automatically", async () => {
    const key = "2026/09/nested/deep/file.bin";
    await storage.save({ key, data: Readable.from(Buffer.from("x")) });
    expect(await storage.exists(key)).toBe(true);
  });

  it("deleting a missing key is a no-op, not an error", async () => {
    await expect(
      storage.delete("2026/09/never-existed.bin"),
    ).resolves.toBeUndefined();
  });

  it("refuses to save outside its root", async () => {
    await expect(
      storage.save({
        key: "../outside.txt",
        data: Readable.from(Buffer.from("x")),
      }),
    ).rejects.toBeInstanceOf(PathEscapeError);
  });
});
