/** Thin fetch wrapper matching the API.md envelope — shared by every client-side form. */

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

export async function postJson<T>(
  url: string,
  body: unknown,
  options: { csrfCookieName?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.csrfCookieName) {
    const token = getCsrfToken(options.csrfCookieName);
    if (token) headers["X-CSRF-Token"] = token;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new ApiError(json.error);
  }
  return json.data as T;
}
