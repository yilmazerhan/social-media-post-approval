import { NextResponse } from "next/server";
import { protectedHandler } from "@/server/http/handler";
import { deleteAttachment } from "@/modules/attachments";

/** "detaches; the file is removed by the orphan job" — only ever legal while `TEMPORARY` (deleteAttachment enforces this). */
export const DELETE = protectedHandler<undefined, undefined>(
  {},
  async ({ params, user }) => {
    await deleteAttachment(params.id, user.id);
    return { raw: new NextResponse(null, { status: 204 }) };
  },
);
