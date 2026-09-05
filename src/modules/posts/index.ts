/**
 * Posts, immutable versions and editor validation. See DATABASE.md §4, ARCHITECTURE.md §4.
 * Depends on `approvals` (route resolution, the transition table) for
 * submission, per ARCHITECTURE.md §2's module-dependency convention.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  getEmployeeDashboard,
  getContentVolumeSeries,
  type EmployeeDashboard,
  type EmployeePostCounts,
  type PostActivityEntry,
  type ContentVolumePoint,
} from "./dashboard";
export {
  createDraft,
  getPostForEdit,
  updateDraft,
  autosaveDraft,
  getReadiness,
} from "./service";
export { submitPost, type SubmitResult } from "./submit";
export {
  type PostEditorDto,
  type ReadinessChecklist,
  type ReadinessItem,
  type RoutePreview,
  type ChangesRequestedBanner,
} from "./types";
export {
  createPostSchema,
  updatePostSchema,
  autosavePostSchema,
  submitPostSchema,
  type CreatePostInput,
  type UpdatePostInput,
  type AutosavePostInput,
  type SubmitPostInput,
} from "./validation";
export {
  tiptapDocumentSchema,
  EMPTY_DOCUMENT,
  type TiptapDocument,
} from "./content-schema";
