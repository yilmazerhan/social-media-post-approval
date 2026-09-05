import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { protectedHandler, NotFoundError } from "@/server/http/handler";
import { ForbiddenError } from "@/modules/authorization";
import {
  getAttachmentOrThrow,
  canReadAttachment,
  getFileStorage,
} from "@/modules/attachments";

/** The generated preview — a resized image derivative, or a video's extracted poster frame. Same authorization as `/content`. */
export const GET = protectedHandler<undefined, undefined>(
  {},
  async ({ params, user }) => {
    const attachment = await getAttachmentOrThrow(params.id);
    if (!attachment.thumbnailKey) {
      throw new NotFoundError("No preview available for this attachment.");
    }
    if (!(await canReadAttachment(attachment, user.id))) {
      throw new ForbiddenError("POST_READ_OWN");
    }

    const nodeStream = await getFileStorage().read(attachment.thumbnailKey);
    const webStream = Readable.toWeb(
      nodeStream,
    ) as unknown as ReadableStream<Uint8Array>;
    const mimeType =
      attachment.kind === "VIDEO" ? "image/jpeg" : attachment.mimeType;

    return {
      raw: new NextResponse(webStream, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": "inline",
          "X-Content-Type-Options": "nosniff",
        },
      }),
    };
  },
);
