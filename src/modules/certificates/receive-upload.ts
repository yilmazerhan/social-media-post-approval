/**
 * Parses the `multipart/form-data` body of the certificate upload
 * endpoint: one small file field (the `.jks` keystore) plus two text
 * fields (`keystorePassword`, optional `keyPassword`). A keystore is a
 * few KB to a few hundred KB at most, so this collects the file straight
 * into memory rather than streaming to disk the way the (much larger)
 * post-attachment pipeline does — see attachments/upload-stream.ts.
 */
import { Readable } from "node:stream";
import Busboy from "busboy";
import { FileRejectedError } from "@/server/http/handler";

/** A keystore this size would already be unreasonable — a generous ceiling, not a tunable. */
const MAX_JKS_SIZE = 2 * 1024 * 1024;

export interface ReceivedJksUpload {
  fileBuffer: Buffer;
  keystorePassword: string;
  keyPassword?: string;
}

export async function receiveJksUpload(
  body: ReadableStream<Uint8Array> | null,
  contentType: string,
): Promise<ReceivedJksUpload> {
  if (!body) {
    throw new FileRejectedError("No file was uploaded.", "UPLOAD_FAILED");
  }

  return new Promise<ReceivedJksUpload>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const fields: Record<string, string> = {};
    let fileChunks: Buffer[] | null = null;
    let truncated = false;

    const bb = Busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fileSize: MAX_JKS_SIZE },
    });

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("file", (_field, stream) => {
      fileChunks = [];
      const chunks = fileChunks;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        truncated = true;
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
      settle(() => {
        if (truncated) {
          reject(
            new FileRejectedError(
              "The keystore file is too large.",
              "FILE_TOO_LARGE",
            ),
          );
          return;
        }
        if (!fileChunks) {
          reject(
            new FileRejectedError(
              "No keystore file found in the upload.",
              "UPLOAD_FAILED",
            ),
          );
          return;
        }
        if (!fields.keystorePassword) {
          reject(
            new FileRejectedError(
              "The keystore password is required.",
              "UPLOAD_FAILED",
            ),
          );
          return;
        }
        resolve({
          fileBuffer: Buffer.concat(fileChunks),
          keystorePassword: fields.keystorePassword,
          keyPassword: fields.keyPassword || undefined,
        });
      });
    });

    Readable.fromWeb(body as never).pipe(bb);
  });
}
