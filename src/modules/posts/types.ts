import type {
  ApprovalActionType,
  Priority,
  PostStatus,
} from "@/generated/prisma/client";
import type { AttachmentDto } from "@/modules/attachments";
import type { DiffSegment } from "@/lib/diff";
import type { TiptapDocument } from "./content-schema";

export interface ChangesRequestedBanner {
  comment: string;
  actorName: string;
  createdAt: string;
  versionNumber: number;
}

export interface PostEditorDto {
  id: string;
  reference: string;
  title: string;
  status: PostStatus;
  priority: Priority;
  departmentId: string | null;
  draftTitle: string | null;
  draftContentJson: TiptapDocument;
  attachments: AttachmentDto[];
  draftUpdatedAt: string | null;
  requestedApproverId: string | null;
  requestedGroupId: string | null;
  changeSummary: string | null;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
  capabilities: {
    canEdit: boolean;
    canSubmit: boolean;
  };
  changesRequested: ChangesRequestedBanner | null;
}

export interface ReadinessItem {
  key: "title" | "content" | "attachments" | "department" | "route";
  label: string;
  passed: boolean;
}

export interface RoutePreview {
  ruleName: string;
  assigneeName: string;
}

export interface ReadinessChecklist {
  items: ReadinessItem[];
  ready: boolean;
  /** The route the post would take if submitted right now, or null if none resolves — read-only, mirrors DATABASE.md §5's "computed server-side". */
  routePreview: RoutePreview | null;
}

/** UI_UX_SPEC.md §6's Post Details Overview tab. */
export interface PostDetailDto {
  id: string;
  reference: string;
  title: string;
  status: PostStatus;
  priority: Priority;
  creatorName: string;
  departmentName: string | null;
  currentVersionNumber: number | null;
  approvedVersionNumber: number | null;
  approverName: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  dueAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  capabilities: {
    canEdit: boolean;
  };
}

export interface VersionSummaryDto {
  id: string;
  versionNumber: number;
  title: string;
  createdAt: string;
  submittedAt: string | null;
  changeSummary: string | null;
  createdByName: string;
  attachmentCount: number;
}

export interface VersionDetailDto extends VersionSummaryDto {
  contentHtml: string;
  characterCount: number;
  wordCount: number;
  attachments: AttachmentDto[];
}

export interface AttachmentDelta {
  added: AttachmentDto[];
  removed: AttachmentDto[];
  /** Same set of attachments on both sides, but in a different order. */
  reordered: boolean;
}

export interface VersionCompareDto {
  from: VersionSummaryDto;
  to: VersionSummaryDto;
  titleChanged: boolean;
  textDiff: DiffSegment[];
  attachmentDelta: AttachmentDelta;
}

export type ActivityEntryType = "VERSION_CREATED" | "ACTION" | "COMMENT";

export interface ActivityEntryDto {
  id: string;
  type: ActivityEntryType;
  createdAt: string;
  actorName: string | null;
  /** Only set for type "ACTION" — lets the client reuse `ACTION_LABELS`. */
  action: ApprovalActionType | null;
  versionNumber: number | null;
  /** A REQUEST_CHANGES/REJECT comment, or a real Comment's body — null otherwise. */
  detail: string | null;
}
