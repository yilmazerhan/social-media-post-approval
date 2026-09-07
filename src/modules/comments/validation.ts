import { z } from "zod";
import { config } from "@/server/config";

const uuid = z.string().uuid();

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(config.COMMENT_MAX_CHARACTERS),
  postVersionId: uuid.nullable().optional(),
  parentId: uuid.nullable().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(config.COMMENT_MAX_CHARACTERS),
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
