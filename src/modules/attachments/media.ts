/**
 * Upload pipeline steps 3-6 — ARCHITECTURE.md §6. The magic-byte sniff
 * (step 3) is the first real content check; Sharp's re-encode and
 * ffprobe's stream parse (step 4-5) are the ones that actually neutralise
 * a polyglot, since a crafted file can pass the sniff (correct leading
 * magic bytes) yet fail to decode as a genuine image/video stream.
 */
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { config } from "@/server/config";
import { FileRejectedError } from "@/server/http/handler";
import {
  generateStorageKey,
  withKeySuffix,
  type FileStorage,
} from "./file-storage";
import { requireCanonicalExtension, SHARP_FORMAT_BY_MIME } from "./validation";

const execFileAsync = promisify(execFile);

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Step 3 — the real content must match what was declared; a mismatch (including anything the sniffer can't recognise at all, e.g. a disguised SVG) is a rejection. */
export async function verifyMagicBytes(
  tempPath: string,
  declaredMimeType: string,
): Promise<void> {
  const detected = await fileTypeFromFile(tempPath);
  if (!detected || detected.mime !== declaredMimeType) {
    throw new FileRejectedError(
      "The file's content doesn't match its declared type.",
      "FILE_TYPE_REJECTED",
    );
  }
}

export interface ProcessedMedia {
  storageKey: string;
  byteSize: number;
  checksumSha256: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  videoCodec?: string;
  thumbnailKey?: string;
  posterKey?: string;
}

/**
 * Step 4 — re-encodes through Sharp (strips EXIF and any embedded
 * payload riding along with otherwise-valid image bytes) and writes a
 * `THUMBNAIL_WIDTH`-wide derivative next to it.
 */
export async function processImage(params: {
  tempPath: string;
  mimeType: string;
  storage: FileStorage;
}): Promise<ProcessedMedia> {
  const format = SHARP_FORMAT_BY_MIME[params.mimeType];
  const isAnimated = params.mimeType === "image/gif";

  let metadata;
  let buffer: Buffer;
  try {
    const image = sharp(
      params.tempPath,
      isAnimated ? { animated: true } : undefined,
    ).rotate();
    metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("no dimensions");
    }
    buffer = await image.toFormat(format).toBuffer();
  } catch {
    throw new FileRejectedError(
      "This file isn't a valid image.",
      "FILE_TYPE_REJECTED",
    );
  }

  const key = generateStorageKey(requireCanonicalExtension(params.mimeType));
  await params.storage.save({ key, data: Readable.from(buffer) });

  const thumbnailBuffer = await sharp(
    buffer,
    isAnimated ? { animated: true } : undefined,
  )
    .resize({ width: config.THUMBNAIL_WIDTH, withoutEnlargement: true })
    .toFormat(format)
    .toBuffer();
  const thumbnailKey = withKeySuffix(key, "-thumb");
  await params.storage.save({
    key: thumbnailKey,
    data: Readable.from(thumbnailBuffer),
  });

  return {
    storageKey: key,
    byteSize: buffer.byteLength,
    checksumSha256: sha256(buffer),
    width: metadata.width,
    height: metadata.height,
    thumbnailKey,
  };
}

interface FfprobeStream {
  codec_name?: string;
  width?: number;
  height?: number;
}
interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

/** Step 5 (probe) — a malformed container fails to parse and is rejected, not silently accepted. */
async function probeVideo(tempPath: string): Promise<{
  durationSeconds: number;
  codec: string;
  width: number;
  height: number;
}> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(config.FFPROBE_PATH, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height:format=duration",
      "-of",
      "json",
      tempPath,
    ]));
  } catch {
    throw new FileRejectedError(
      "This file isn't a valid video.",
      "FILE_TYPE_REJECTED",
    );
  }

  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const stream = parsed.streams?.[0];
  if (!stream?.codec_name || !stream.width || !stream.height) {
    throw new FileRejectedError(
      "This file isn't a valid video.",
      "FILE_TYPE_REJECTED",
    );
  }
  return {
    durationSeconds: Math.round(Number(parsed.format?.duration ?? 0)),
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
  };
}

/** Step 5 (poster) — one representative frame, scaled to `THUMBNAIL_WIDTH`; doubles as both `thumbnailKey` and `posterKey` rather than generating two near-identical images. */
async function extractPosterFrame(tempPath: string): Promise<Buffer> {
  const posterTempPath = `${tempPath}-poster-${randomUUID()}.jpg`;
  try {
    await execFileAsync(config.FFMPEG_PATH, [
      "-y",
      "-i",
      tempPath,
      "-vf",
      `thumbnail,scale=${config.THUMBNAIL_WIDTH}:-1`,
      "-frames:v",
      "1",
      posterTempPath,
    ]);
    return await readFile(posterTempPath);
  } catch {
    throw new FileRejectedError(
      "Could not generate a preview for this video.",
      "FILE_TYPE_REJECTED",
    );
  } finally {
    await unlink(posterTempPath).catch(() => {});
  }
}

/** Steps 5-6 for video — no re-encode of the video body itself, only metadata + a poster frame. */
export async function processVideo(params: {
  tempPath: string;
  mimeType: string;
  storage: FileStorage;
}): Promise<ProcessedMedia> {
  const probe = await probeVideo(params.tempPath);
  const posterBuffer = await extractPosterFrame(params.tempPath);
  const buffer = await readFile(params.tempPath);

  const key = generateStorageKey(requireCanonicalExtension(params.mimeType));
  await params.storage.save({ key, data: Readable.from(buffer) });

  const posterKey = withKeySuffix(key, "-poster", ".jpg");
  await params.storage.save({
    key: posterKey,
    data: Readable.from(posterBuffer),
  });

  return {
    storageKey: key,
    byteSize: buffer.byteLength,
    checksumSha256: sha256(buffer),
    width: probe.width,
    height: probe.height,
    durationSeconds: probe.durationSeconds,
    videoCodec: probe.codec,
    thumbnailKey: posterKey,
    posterKey,
  };
}
