/**
 * Decision-body schemas — API.md §3's representative payloads. `comment`/
 * `reason` stay optional here even where the endpoint requires them: the
 * mandatory-content check has its own error code (`COMMENT_REQUIRED`, with
 * a `field` naming which one) distinct from generic `VALIDATION_FAILED`,
 * so it's enforced in decisions.ts, not by a Zod `.min(1)`.
 */
import { z } from "zod";

const uuid = z.string().uuid();

export const approveSchema = z.object({
  postVersionId: uuid,
  lockVersion: z.number().int().min(0),
  comment: z.string().trim().max(2000).optional(),
});
export type ApproveInput = z.infer<typeof approveSchema>;

export const requestChangesSchema = z.object({
  postVersionId: uuid,
  lockVersion: z.number().int().min(0),
  comment: z.string().max(2000).optional(),
});
export type RequestChangesInput = z.infer<typeof requestChangesSchema>;

export const rejectSchema = z.object({
  postVersionId: uuid,
  lockVersion: z.number().int().min(0),
  reason: z.string().max(2000).optional(),
});
export type RejectInput = z.infer<typeof rejectSchema>;
