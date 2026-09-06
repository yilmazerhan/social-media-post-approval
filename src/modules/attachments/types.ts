import type {
  AttachmentKind,
  AttachmentStatus,
} from "@/generated/prisma/client";

export interface AttachmentDto {
  id: string;
  originalFilename: string;
  kind: AttachmentKind;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  status: AttachmentStatus;
  hasThumbnail: boolean;
}
