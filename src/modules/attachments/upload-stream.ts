/**
 * Upload pipeline step 1 — ARCHITECTURE.md §6: "Stream to a temp file under
 * `STORAGE_PATH/tmp` with a hard size cap." `busboy` parses the multipart
 * body incrementally so the cap is enforced while bytes are still
 * arriving, not after the whole file has already been buffered — an
 * oversize upload is aborted mid-stream, not read to completion first.
 */
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import Busboy from "busboy";
import { config } from "@/server/config";
import { FileRejectedError } from "@/server/http/handler";
import { resolveStorageKey } from "./file-storage";

export interface ReceivedUpload {
  tempPath: string;
  originalFilename: string;
  declaredMimeType: string;
  byteSize: number;
}

/**
 * Reads the single file field of a `multipart/form-data` request body into
 * a temp file, rejecting anything over `MAX_UPLOAD_SIZE` as soon as the
 * limit is crossed. Caller is responsible for deleting `tempPath` once
 * done with it.
 */
export async function receiveUpload(
  body: ReadableStream<Uint8Array> | null,
  contentType: string,
): Promise<ReceivedUpload> {
  if (!body) {
    throw new FileRejectedError("No file was uploaded.", "UPLOAD_FAILED");
  }

  await mkdir(config.STORAGE_TMP_PATH, { recursive: true });
  const tempPath = resolveStorageKey(
    config.STORAGE_TMP_PATH,
    `${randomUUID()}.part`,
  );

  return new Promise<ReceivedUpload>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const bb = Busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fileSize: config.MAX_UPLOAD_SIZE },
    });

    // Busboy's own "finish" (parsing done) can fire before the per-file
    // write stream below finishes flushing to disk — without this flag,
    // that race rejects a perfectly valid upload as "no file field found".
    let sawFile = false;

    bb.on("file", (_field, stream, info) => {
      sawFile = true;
      const writeStream = createWriteStream(tempPath);
      let byteSize = 0;
      let truncated = false;

      stream.on("data", (chunk: Buffer) => {
        byteSize += chunk.length;
      });
      stream.on("limit", () => {
        truncated = true;
      });

      stream.pipe(writeStream);

      writeStream.on("finish", () => {
        if (truncated) {
          settle(() => {
            void unlink(tempPath).catch(() => {});
            reject(
              new FileRejectedError(
                "File exceeds the maximum upload size.",
                "FILE_TOO_LARGE",
              ),
            );
          });
          return;
        }
        settle(() => {
          resolve({
            tempPath,
            originalFilename: info.filename,
            declaredMimeType: info.mimeType,
            byteSize,
          });
        });
      });
      writeStream.on("error", (err) => {
        settle(() => reject(err));
      });
    });

    bb.on("filesLimit", () => {
      settle(() =>
        reject(
          new FileRejectedError("Only one file per upload.", "UPLOAD_FAILED"),
        ),
      );
    });

    bb.on("error", (err) => {
      settle(() =>
        reject(
          err instanceof Error
            ? err
            : new FileRejectedError("Upload failed.", "UPLOAD_FAILED"),
        ),
      );
    });

    bb.on("finish", () => {
      if (sawFile) return; // the per-file write stream's own "finish" settles the promise
      settle(() =>
        reject(
          new FileRejectedError(
            "No file field found in the upload.",
            "UPLOAD_FAILED",
          ),
        ),
      );
    });

    Readable.fromWeb(body as never).pipe(bb);
  });
}
