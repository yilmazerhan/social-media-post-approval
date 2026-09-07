import { protectedHandler } from "@/server/http/handler";
import { uploadAttachment } from "@/modules/attachments";

/** `multipart/form-data`, one file — API.md's `/api/v1/attachments`. No JSON `schema`: the body is parsed as a byte stream, not `request.json()`. */
export const POST = protectedHandler(
  { permission: "POST_CREATE" },
  async ({ request, user }) => {
    const attachment = await uploadAttachment({
      body: request.body,
      contentType: request.headers.get("content-type") ?? "",
      uploadedById: user.id,
    });
    return { data: attachment, status: 201 };
  },
);
