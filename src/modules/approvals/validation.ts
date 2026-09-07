/**
 * Decision-body schemas — API.md §3's representative payloads. `comment`/
 * `reason` stay optional here even where the endpoint requires them: the
 * mandatory-content check has its own error code (`COMMENT_REQUIRED`, with
 * a `field` naming which one) distinct from generic `VALIDATION_FAILED`,
 * so it's enforced in decisions.ts, not by a Zod `.min(1)`.
 */
import { z } from "zod";

const uuid = z.string().uuid();
const PRIORITY_VALUES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

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

export const reassignSchema = z
  .object({
    assigneeUserId: uuid.nullable().optional(),
    assigneeGroupId: uuid.nullable().optional(),
  })
  .refine(
    (data) => Boolean(data.assigneeUserId) !== Boolean(data.assigneeGroupId),
    {
      message: "Exactly one of assigneeUserId or assigneeGroupId is required.",
      path: ["assigneeUserId"],
    },
  );
export type ReassignInput = z.infer<typeof reassignSchema>;

/** UI_UX_SPEC.md §6's admin "test this rule" preview — the same shape `resolveApprovalRoute` matches against, minus an actual `Post` row. */
export const routePreviewSchema = z.object({
  departmentId: uuid.nullable().optional(),
  priority: z.enum(PRIORITY_VALUES).default("NORMAL"),
  creatorId: uuid,
  requestedApproverId: uuid.nullable().optional(),
  requestedGroupId: uuid.nullable().optional(),
});
export type RoutePreviewInput = z.infer<typeof routePreviewSchema>;
