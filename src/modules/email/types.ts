export interface SendTemplatedEmailInput {
  templateKey: string;
  to: string;
  cc?: string;
  variables: Record<string, string | number>;
  postId?: string | null;
  userId?: string | null;
  /** A repeated call with the same key is a harmless no-op — DATABASE.md §6/7's idempotency pattern for JobSchedule/BackgroundJob, applied to email too. */
  idempotencyKey?: string;
}

/** `EMAIL_SEND` BackgroundJob payload — fully rendered at enqueue time (ARCHITECTURE.md §8: "EmailService renders... into a queued EMAIL_SEND job"), so the worker only ever delivers, never re-renders. */
export interface EmailSendJobPayload {
  emailLogId: string;
  to: string;
  cc?: string;
  subject: string;
  html?: string;
  text?: string;
}
