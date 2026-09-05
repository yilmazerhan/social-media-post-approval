import { apiFetch } from '@shared/api/http';
import type {
  ApprovalReview,
  ApprovalSummary,
  AiReview,
  AttachmentStatus,
  AuthMethods,
  Channel,
  Comment,
  Neighbours,
  NotificationItem,
  PostDetail,
  PostSummary,
  PostVersion,
  PresignResult,
  Session,
  SubmitResult,
  UserSummary,
  VersionComparison,
} from '@shared/api/types';

/** Every call the two hero screens make. One place to look for what the UI actually does. */

export const authApi = {
  methods: () => apiFetch<AuthMethods>('/auth/methods'),
  login: (username: string, password: string) =>
    apiFetch<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
  me: () => apiFetch<Session>('/me'),
};

export const postsApi = {
  list: (params?: { status?: string | undefined; mine?: boolean | undefined }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.mine !== undefined) query.set('mine', String(params.mine));
    return apiFetch<PostSummary[]>(`/posts${query.size ? `?${query}` : ''}`);
  },
  create: (title: string, channelId?: string) =>
    apiFetch<PostDetail>('/posts', { method: 'POST', body: JSON.stringify({ title, channelId }) }),
  get: (id: string) => apiFetch<PostDetail>(`/posts/${id}`),
  update: (
    id: string,
    body: {
      title?: string | undefined;
      bodyHtml?: string | undefined;
      priority?: string | undefined;
      channelId?: string | null | undefined;
      concurrencyToken?: number | undefined;
    },
  ) => apiFetch<PostDetail>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => apiFetch<void>(`/posts/${id}`, { method: 'DELETE' }),
  versions: (id: string) => apiFetch<PostVersion[]>(`/posts/${id}/versions`),
  compare: (id: string, from: number, to: number) =>
    apiFetch<VersionComparison>(`/posts/${id}/versions/compare?from=${from}&to=${to}`),
  submit: (
    id: string,
    body: {
      approverIds?: string[] | undefined;
      mode?: string | undefined;
      note?: string | undefined;
      dueAt?: string | undefined;
    },
  ) => apiFetch<SubmitResult>(`/posts/${id}/submit`, { method: 'POST', body: JSON.stringify(body) }),
  withdraw: (id: string) => apiFetch<void>(`/posts/${id}/withdraw`, { method: 'POST' }),
  timeline: (id: string) => apiFetch<import('@shared/api/types').TimelineEntry[]>(`/posts/${id}/timeline`),
};

export const attachmentsApi = {
  presign: (postId: string, file: { filename: string; contentType: string; sizeBytes: number }) =>
    apiFetch<PresignResult>(`/posts/${postId}/attachments/presign`, {
      method: 'POST',
      body: JSON.stringify(file),
    }),
  complete: (attachmentId: string, durationSeconds?: number) =>
    apiFetch<import('@shared/api/types').Attachment>(`/attachments/${attachmentId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ durationSeconds: durationSeconds ?? null }),
    }),
  describe: (
    attachmentId: string,
    body: { altText?: string | undefined; caption?: string | undefined; sortOrder?: number | undefined },
  ) =>
    apiFetch<import('@shared/api/types').Attachment>(`/attachments/${attachmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (attachmentId: string) => apiFetch<void>(`/attachments/${attachmentId}`, { method: 'DELETE' }),
};

export const approvalsApi = {
  queue: (open = true) => apiFetch<ApprovalSummary[]>(`/approvals?open=${open}`),
  review: (id: string) => apiFetch<ApprovalReview>(`/approvals/${id}`),
  neighbours: (id: string) => apiFetch<Neighbours>(`/approvals/${id}/neighbours`),
  decide: (id: string, body: { decision: string; comment?: string | undefined; expectedVersionNo: number }) =>
    apiFetch<ApprovalReview>(`/approvals/${id}/decisions`, { method: 'POST', body: JSON.stringify(body) }),
};

export const commentsApi = {
  list: (postId: string) => apiFetch<Comment[]>(`/posts/${postId}/comments`),
  add: (
    postId: string,
    body: { body: string; parentCommentId?: string | undefined; internal?: boolean | undefined },
  ) => apiFetch<Comment>(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify(body) }),
};

export const aiApi = {
  latest: (postId: string) => apiFetch<AiReview | undefined>(`/posts/${postId}/ai-review`),
  run: (postId: string, versionId?: string) =>
    apiFetch<AiReview>(`/posts/${postId}/ai-review${versionId ? `?versionId=${versionId}` : ''}`, {
      method: 'POST',
    }),
  acknowledge: (findingId: string) =>
    apiFetch<unknown>(`/ai-findings/${findingId}/acknowledge`, { method: 'POST' }),
  dismiss: (findingId: string) => apiFetch<unknown>(`/ai-findings/${findingId}/dismiss`, { method: 'POST' }),
};

export const referenceApi = {
  channels: () => apiFetch<Channel[]>('/channels'),
  approvers: () => apiFetch<UserSummary[]>('/users/approvers'),
};

export const notificationsApi = {
  list: () => apiFetch<NotificationItem[]>('/notifications'),
  unreadCount: () => apiFetch<{ count: number }>('/notifications/unread-count'),
  markAllRead: () => apiFetch<void>('/notifications/read-all', { method: 'POST' }),
};

export type { AttachmentStatus };
