/** Thin fetch wrapper matching the API.md envelope — shared by every client-side form. */

/**
 * The cookie's *name* isn't sensitive (only the token value it carries is),
 * so it's safe as a client-side constant — it just has to match
 * CONFIGURATION.md's CSRF_COOKIE_NAME default. If a deployment ever
 * customizes that env var, this constant needs updating too.
 */
export const CSRF_COOKIE_NAME = "ca_csrf";

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  code: string;
  details?: ApiErrorDetail[];

  constructor(error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  }) {
    super(error.message);
    this.code = error.code;
    this.details = error.details;
  }
}

export function getCsrfToken(cookieName: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${cookieName}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json = await response.json();
  if (!response.ok) {
    throw new ApiError(json.error);
  }
  return json.data as T;
}

function csrfHeaders(csrfCookieName?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (csrfCookieName) {
    const token = getCsrfToken(csrfCookieName);
    if (token) headers["X-CSRF-Token"] = token;
  }
  return headers;
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  return handleResponse<T>(response);
}

export async function postJson<T>(
  url: string,
  body: unknown,
  options: { csrfCookieName?: string } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(options.csrfCookieName),
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function patchJson<T>(
  url: string,
  body: unknown,
  options: { csrfCookieName?: string } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(options.csrfCookieName),
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function deleteJson<T>(
  url: string,
  options: { csrfCookieName?: string } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: "DELETE",
    headers: csrfHeaders(options.csrfCookieName),
    credentials: "same-origin",
  });
  return handleResponse<T>(response);
}
