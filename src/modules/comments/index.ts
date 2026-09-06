/**
 * Threaded comments, mentions, and mention autocomplete — DATABASE.md §6.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  assertCanAccessPost,
  listComments,
  createComment,
  updateComment,
  deleteComment,
} from "./service";
export {
  listMentionableUsers,
  parseAndRenderComment,
  type MentionCandidate,
  type RenderedComment,
} from "./mentions";
export {
  createCommentSchema,
  updateCommentSchema,
  type CreateCommentInput,
  type UpdateCommentInput,
} from "./validation";
export type { CommentDto, MentionableUserDto } from "./types";
