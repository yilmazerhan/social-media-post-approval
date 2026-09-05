/**
 * Approval workflow state machine, routing rules, assignment, decisions. See ARCHITECTURE.md §4, DATABASE.md §5.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  getApproverDashboard,
  getSystemApprovalStats,
  type ApproverCounts,
  type ApproverDashboard,
  type SlaComplianceSummary,
  type SystemApprovalStats,
} from "./dashboard";
export {
  resolveApprovalRoute,
  resolveAssigneeName,
  previewApprovalRoute,
  type ResolvedRoute,
  type RoutablePost,
  type RoutePreviewResult,
} from "./route-resolution";
export { reassignApproval, type ReassignResult } from "./assignment";
export {
  getApprovalQueue,
  type QueueFilters,
  type QueueRow,
  type QueuePage,
} from "./queue";
export { assertLegalTransition } from "./state-machine";
export {
  startReview,
  approvePost,
  rejectPost,
  requestChanges,
  loadApprovalActionResource,
  type StartReviewResult,
  type ApproveResult,
  type RequestChangesResult,
  type RejectResult,
  type ApprovalActionResource,
} from "./decisions";
export {
  approveSchema,
  requestChangesSchema,
  rejectSchema,
  reassignSchema,
  routePreviewSchema,
  type ApproveInput,
  type RequestChangesInput,
  type RejectInput,
  type ReassignInput,
  type RoutePreviewInput,
} from "./validation";
