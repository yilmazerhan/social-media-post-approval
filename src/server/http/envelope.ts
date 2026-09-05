/** Consistent success/error response shapes — API.md §1. */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "INVALID_TRANSITION"
  | "STALE_RESOURCE"
  | "ALREADY_DECIDED"
  | "ASSIGNMENT_NOT_YOURS"
  | "COMMENT_REQUIRED"
  | "FILE_TYPE_REJECTED"
  | "FILE_TOO_LARGE"
  | "UPLOAD_FAILED"
  | "RATE_LIMITED"
  | "CSRF_FAILED"
  | "ACCOUNT_LOCKED"
  | "PROVIDER_MISMATCH"
  | "INTERNAL_ERROR";

export function jsonSuccess<T>(
  data: T,
  init?: {
    status?: number;
    meta?: Record<string, unknown>;
    headers?: HeadersInit;
  },
): NextResponse {
  return NextResponse.json(
    { data, ...(init?.meta ? { meta: init.meta } : {}) },
    { status: init?.status ?? 200, headers: init?.headers },
  );
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorDetail[],
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details && details.length > 0 ? { details } : {}),
        traceId: randomUUID(),
      },
    },
    { status },
  );
}
