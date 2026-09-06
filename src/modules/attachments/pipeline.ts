/**
 * Orchestrates the full seven-step upload pipeline (ARCHITECTURE.md §6)
 * and persists the resulting `Attachment` row. Steps 1 (stream to temp
 * file) and 3-6 (sniff, re-encode/probe, checksum, store, thumbnail) live
 * in `upload-stream.ts`/`media.ts`; this module is steps 2 and 6's
 * `Attachment` write, plus the temp-file cleanup that always runs
 * regardless of outcome.
 */
import { unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { FileRejectedError } from "@/server/http/handler";
import type { Attachment } from "@/generated/prisma/client";
import { receiveUpload } from "./upload-stream";
import { verifyMagicBytes, processImage, processVideo } from "./media";
import { getFileStorage } from "./file-storage";
import {
  kindForMime,
  extensionMatchesMime,
  sanitizeFilename,
} from "./validation";

export async function runUploadPipeline(params: {
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
  uploadedById: string;
}): Promise<Attachment> {
  const raw = await receiveUpload(params.body, params.contentType);
  try {
    // Step 2 — extension allowlist + declared MIME check.
    const kind = kindForMime(raw.declaredMimeType);
    if (!kind) {
      throw new FileRejectedError(
        raw.declaredMimeType === "image/svg+xml"
          ? "SVG files are not accepted."
          : "This file type is not accepted.",
        "FILE_TYPE_REJECTED",
      );
    }
    const actualExtension = path.extname(raw.originalFilename);
    if (!extensionMatchesMime(actualExtension, raw.declaredMimeType)) {
      throw new FileRejectedError(
        "The file extension doesn't match its type.",
        "FILE_TYPE_REJECTED",
      );
    }
    if (kind === "IMAGE" && raw.byteSize > config.MAX_IMAGE_SIZE) {
      throw new FileRejectedError(
        "Image exceeds the maximum size.",
        "FILE_TOO_LARGE",
      );
    }

    // Step 3 — magic-byte sniff.
    await verifyMagicBytes(raw.tempPath, raw.declaredMimeType);

    // Steps 4-6 — re-encode/probe, checksum, store, thumbnail.
    const storage = getFileStorage();
    const processed =
      kind === "IMAGE"
        ? await processImage({
            tempPath: raw.tempPath,
            mimeType: raw.declaredMimeType,
            storage,
          })
        : await processVideo({
            tempPath: raw.tempPath,
            mimeType: raw.declaredMimeType,
            storage,
          });

    return await prisma.attachment.create({
      data: {
        storageKey: processed.storageKey,
        originalFilename: raw.originalFilename,
        sanitizedFilename: sanitizeFilename(raw.originalFilename),
        kind,
        mimeType: raw.declaredMimeType,
        extension: path.extname(processed.storageKey),
        byteSize: processed.byteSize,
        checksumSha256: processed.checksumSha256,
        width: processed.width,
        height: processed.height,
        durationSeconds: processed.durationSeconds,
        videoCodec: processed.videoCodec,
        thumbnailKey: processed.thumbnailKey,
        posterKey: processed.posterKey,
        status: "TEMPORARY",
        uploadedById: params.uploadedById,
      },
    });
  } finally {
    await unlink(raw.tempPath).catch(() => {});
  }
}
