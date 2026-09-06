import { protectedHandler } from "@/server/http/handler";
import {
  getCurrentCertificate,
  receiveJksUpload,
  uploadCertificate,
} from "@/modules/certificates";

/** API.md's `/api/v1/admin/certificate` — Administration -> TLS Certificate. */
export const GET = protectedHandler(
  { permission: "CERTIFICATE_MANAGE" },
  async () => {
    const info = await getCurrentCertificate();
    return { data: info };
  },
);

/** `multipart/form-data`: a `.jks` file plus `keystorePassword` and optional `keyPassword` fields. No JSON `schema` — the body is parsed as a byte stream. */
export const POST = protectedHandler(
  { permission: "CERTIFICATE_MANAGE" },
  async ({ request, user }) => {
    const upload = await receiveJksUpload(
      request.body,
      request.headers.get("content-type") ?? "",
    );
    const info = await uploadCertificate({
      fileBuffer: upload.fileBuffer,
      keystorePassword: upload.keystorePassword,
      keyPassword: upload.keyPassword,
      actorId: user.id,
      actorEmail: user.email,
    });
    return { data: info };
  },
);
