/**
 * `FileStorage` and its only implementation, `LocalFileStorage` —
 * ARCHITECTURE.md §6. Keys are opaque (`{yyyy}/{mm}/{uuid}{ext}`) and every
 * one is resolved against a root with a normalised-path check that rejects
 * anything escaping it — user-supplied filenames never reach the
 * filesystem, only this module's own generated keys do.
 */
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat as fsStat, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "@/server/config";

export interface SaveInput {
  key: string;
  data: Readable;
}

export interface StoredObject {
  key: string;
  byteSize: number;
}

export interface ObjectStat {
  byteSize: number;
  mtimeMs: number;
}

export interface FileStorage {
  save(input: SaveInput): Promise<StoredObject>;
  read(key: string): Promise<Readable>;
  stat(key: string): Promise<ObjectStat>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/** A storage key that would resolve outside its root — path traversal. */
export class PathEscapeError extends Error {}

/** Resolves `key` under `root`, rejecting anything that would escape it (SECURITY.md's path-traversal control). */
export function resolveStorageKey(root: string, key: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, key);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new PathEscapeError(`Storage key escapes its root: ${key}`);
  }
  return resolved;
}

/** `{yyyy}/{mm}/{uuid}{ext}` — opaque, never derived from a user-supplied filename. */
export function generateStorageKey(extension: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${randomUUID()}${extension}`;
}

/** Derives a sibling key by inserting a suffix before the extension — used for a thumbnail/poster next to its source. */
export function withKeySuffix(
  key: string,
  suffix: string,
  extension?: string,
): string {
  const ext = extension ?? path.extname(key);
  const base = key.slice(0, key.length - path.extname(key).length);
  return `${base}${suffix}${ext}`;
}

export class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  async save(input: SaveInput): Promise<StoredObject> {
    const dest = resolveStorageKey(this.root, input.key);
    await mkdir(path.dirname(dest), { recursive: true });
    let byteSize = 0;
    input.data.on("data", (chunk: Buffer) => {
      byteSize += chunk.length;
    });
    await pipeline(input.data, createWriteStream(dest));
    return { key: input.key, byteSize };
  }

  async read(key: string): Promise<Readable> {
    return createReadStream(resolveStorageKey(this.root, key));
  }

  async stat(key: string): Promise<ObjectStat> {
    const info = await fsStat(resolveStorageKey(this.root, key));
    return { byteSize: info.size, mtimeMs: info.mtimeMs };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(resolveStorageKey(this.root, key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.stat(key);
      return true;
    } catch {
      return false;
    }
  }
}

let instance: FileStorage | null = null;

/** The process-wide `FileStorage` singleton, rooted at `STORAGE_PATH` — mirrors the `prisma` singleton in `@/server/db`. */
export function getFileStorage(): FileStorage {
  if (!instance) instance = new LocalFileStorage(config.STORAGE_PATH);
  return instance;
}
