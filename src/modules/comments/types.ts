export interface CommentDto {
  id: string;
  postId: string;
  postVersionId: string | null;
  postVersionNumber: number | null;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
  /** Whether the caller may still edit — within `COMMENT_EDIT_WINDOW_MINUTES` and the author. */
  canEdit: boolean;
  /** Author, or a `POST_READ_ALL` holder — the same "or admin" signal `checkCancelPost` uses. */
  canDelete: boolean;
  replies: CommentDto[];
}

export interface MentionableUserDto {
  id: string;
  displayName: string;
}
