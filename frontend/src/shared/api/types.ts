/**
 * The API contract as the screens consume it.
 *
 * These mirror the backend DTOs. From the next phase they are generated from the published OpenAPI
 * document (`npm run generate:api`) so a field rename breaks the build rather than production.
 */

export interface UserSummary {
  id: string;
  displayName: string;
  email: string;
  department: string | null;
  jobTitle: string | null;
  initials: string;
}

export interface Session {
  user: UserSummary;
  roles: string[];
  permissions: string[];
  authMethod: string;
}

export interface AuthMethods {
  localEnabled: boolean;
  samlEnabled: boolean;
  samlLoginUrl: string;
}

export interface Channel {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxCharacters: number | null;
  recommendedCharacters: number | null;
  allowsImage: boolean;
  allowsVideo: boolean;
}

export type AttachmentStatus = 'PENDING' | 'UPLOADED' | 'SCANNING' | 'READY' | 'QUARANTINED' | 'FAILED';

export interface Attachment {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: AttachmentStatus;
  statusDetail: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  altText: string | null;
  caption: string | null;
  sortOrder: number;
  contentUrl: string;
  createdAt: string;
}

export type PostStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'EXPIRED';

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface PostDetail {
  id: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  status: PostStatus;
  priority: Priority;
  channel: Channel | null;
  author: UserSummary;
  versionNo: number;
  attachments: Attachment[];
  slaState: string;
  dueAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  concurrencyToken: number;
  editable: boolean;
  submittable: boolean;
}

export interface PostSummary {
  id: string;
  title: string;
  excerpt: string;
  status: PostStatus;
  priority: Priority;
  channel: Channel | null;
  author: UserSummary;
  versionNo: number;
  attachmentCount: number;
  slaState: string;
  dueAt: string | null;
  submittedAt: string | null;
  updatedAt: string;
  aiRiskLevel: string | null;
  awaitingDecisionFrom: UserSummary | null;
}

export interface PostVersion {
  id: string;
  versionNo: number;
  title: string;
  bodyHtml: string;
  bodyText: string;
  reason: string;
  createdBy: UserSummary | null;
  createdAt: string;
  attachments: Attachment[];
}

export type AiSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AiRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AiFinding {
  id: string;
  category: string;
  severity: AiSeverity;
  title: string;
  excerpt: string | null;
  explanation: string;
  suggestion: string | null;
  acknowledged: boolean;
  dismissed: boolean;
}

export interface AiReview {
  id: string;
  postId: string;
  postVersionId: string | null;
  provider: string;
  model: string | null;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  riskLevel: AiRiskLevel | null;
  riskScore: number | null;
  summary: string | null;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  findings: AiFinding[];
}

export interface ApprovalSummary {
  approvalId: string;
  postId: string;
  postTitle: string;
  excerpt: string;
  postStatus: PostStatus;
  priority: Priority;
  channelName: string | null;
  author: UserSummary;
  versionNo: number;
  attachmentCount: number;
  requestedAt: string;
  dueAt: string;
  slaState: 'ON_TRACK' | 'WARNING' | 'BREACHED';
  secondsRemaining: number;
  overdue: boolean;
  aiRiskLevel: AiRiskLevel | null;
  aiStatus: string;
  decidedByMe: boolean;
}

export interface ApprovalHeader {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'CANCELLED' | 'EXPIRED';
  mode: string;
  requiredApprovals: number;
  requestedBy: UserSummary | null;
  requestedAt: string;
  dueAt: string;
  slaState: 'ON_TRACK' | 'WARNING' | 'BREACHED';
  secondsRemaining: number;
  overdue: boolean;
  escalationLevel: number;
  versionNo: number;
  postVersionId: string;
  concurrencyToken: number;
}

export interface Assignee {
  user: UserSummary;
  stepStatus: string;
  assignedAt: string;
  isMe: boolean;
}

export interface Decision {
  id: string;
  decidedBy: UserSummary | null;
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  comment: string | null;
  versionNo: number;
  decidedAt: string;
}

export interface TimelineEntry {
  at: string;
  actor: UserSummary | null;
  action: string;
  versionNo: number | null;
  detail: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  parentCommentId: string | null;
  author: UserSummary | null;
  body: string;
  internal: boolean;
  createdAt: string;
  editedAt: string | null;
  replies: Comment[];
}

export interface ViewerContext {
  canDecide: boolean;
  isAssignedApprover: boolean;
  isAuthor: boolean;
  alreadyDecided: boolean;
  commentRequiredForRejection: boolean;
}

export interface ApprovalReview {
  approval: ApprovalHeader;
  post: PostDetail;
  version: PostVersion;
  assignees: Assignee[];
  decisions: Decision[];
  timeline: TimelineEntry[];
  aiReview: AiReview | null;
  comments: Comment[];
  viewer: ViewerContext;
  availableVersions: number[];
}

export interface Neighbours {
  previousApprovalId: string | null;
  nextApprovalId: string | null;
  position: number;
  total: number;
}

export interface DiffSegment {
  type: 'UNCHANGED' | 'ADDED' | 'REMOVED';
  text: string;
}

export interface VersionComparison {
  from: PostVersion;
  to: PostVersion;
  titleDiff: DiffSegment[];
  bodyDiff: DiffSegment[];
  mediaChanges: Array<{ change: string; attachment: Attachment }>;
  identical: boolean;
}

export interface SubmitResult {
  approvalId: string;
  postId: string;
  postTitle: string;
  versionNo: number;
  dueAt: string;
  approverNames: string[];
}

export interface UploadTarget {
  uploadUrl: string;
  method: string;
  requiredHeaders: Record<string, string>;
  expiresIn: string;
  directToStorage: boolean;
}

export interface PresignResult {
  attachment: Attachment;
  upload: UploadTarget;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  priority: string;
  read: boolean;
  createdAt: string;
}
