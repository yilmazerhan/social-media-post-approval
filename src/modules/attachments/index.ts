/**
 * Upload pipeline, media processing, local file storage. See ARCHITECTURE.md §6.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  uploadAttachment,
  canReadAttachment,
  getAttachmentOrThrow,
  deleteAttachment,
  validateAttachmentOwnership,
  listAttachmentDtos,
  attachToVersion,
  toAttachmentDto,
} from "./service";
export { type AttachmentDto } from "./types";
export { getFileStorage, type FileStorage } from "./file-storage";
