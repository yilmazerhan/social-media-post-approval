import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { protectedHandler } from "@/server/http/handler";
import { ForbiddenError } from "@/modules/authorization";
import {
  getAttachmentOrThrow,
  canReadAttachment,
  getFileStorage,
} from "@/modules/attachments";

/** Streams the original file — SECURITY.md: never web-served directly, always through this authorizing, no-sniff endpoint. */
export const GET = protectedHandler<undefined, undefined>(
  {},
  async ({ params, user }) => {
    const attachment = await getAttachmentOrThrow(params.id);
    if (!(await canReadAttachment(attachment, user.id))) {
      throw new ForbiddenError("POST_READ_OWN");
    }

    const nodeStream = await getFileStorage().read(attachment.storageKey);
    const webStream = Readable.toWeb(
      nodeStream,
    ) as unknown as ReadableStream<Uint8Array>;

    return {
      raw: new NextResponse(webStream, {
        status: 200,
        headers: {
          "Content-Type": attachment.mimeType,
          "Content-Disposition": `attachment; filename="${attachment.sanitizedFilename}"`,
          "Content-Length": String(attachment.byteSize),
          "X-Content-Type-Options": "nosniff",
        },
      }),
    };
  },
);
