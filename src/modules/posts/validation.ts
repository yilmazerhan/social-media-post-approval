import { z } from "zod";
import { config } from "@/server/config";
import { tiptapDocumentSchema } from "./content-schema";

const PRIORITY_VALUES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const uuid = z.string().uuid();
const attachmentIdsSchema = z.array(uuid).max(config.MAX_ATTACHMENTS_PER_POST);

export const createPostSchema = z.object({
  // Empty on purpose: "/posts/new" creates the draft the moment it's
  // opened, before the user has typed anything. "Title provided" is
  // enforced by the readiness checklist at submit time instead.
  title: z.string().trim().max(300).optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  lockVersion: z.number().int().min(0),
  title: z.string().trim().min(1).max(300).optional(),
  contentJson: tiptapDocumentSchema.optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  departmentId: uuid.nullable().optional(),
  requestedApproverId: uuid.nullable().optional(),
  requestedGroupId: uuid.nullable().optional(),
  changeSummary: z.string().trim().max(500).nullable().optional(),
  // Media additions/removals/reorders save immediately (like department),
  // not on the debounced autosave path — see EditorScreen.patchMetadata.
  attachmentIds: attachmentIdsSchema.optional(),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const autosavePostSchema = z.object({
  title: z.string().trim().max(300).optional(),
  contentJson: tiptapDocumentSchema,
});
export type AutosavePostInput = z.infer<typeof autosavePostSchema>;

export const submitPostSchema = z.object({
  lockVersion: z.number().int().min(0),
});
export type SubmitPostInput = z.infer<typeof submitPostSchema>;
