/**
 * Thin fetch wrapper. Everything goes through it so that credentials, CSRF, correlation ids and
 * RFC 9457 problem responses are handled in exactly one place (ARCHITECTURE.md 3.4, 13.4).
 */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  code?: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
}

export class ApiError extends Error {
  constructor(readonly problem: ProblemDetail) {
    super(problem.detail ?? problem.title ?? `Request failed with status ${problem.status}`);
    this.name = 'ApiError';
  }
}

const BASE_URL = '/api/v1';

function csrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const token = csrfToken();
  if (token && init.method && init.method !== 'GET') {
    headers.set('X-XSRF-TOKEN', decodeURIComponent(token));
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'same-origin', // opaque session cookie, never a token in storage
  });

  if (!response.ok) {
    let problem: ProblemDetail = { status: response.status };
    try {
      problem = { ...problem, ...(await response.json()) };
    } catch {
      // A non-JSON error body (gateway, proxy) still has to surface as an ApiError.
    }
    throw new ApiError(problem);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
