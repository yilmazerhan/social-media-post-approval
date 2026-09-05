import type { Priority, PostStatus } from "@/generated/prisma/client";
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
