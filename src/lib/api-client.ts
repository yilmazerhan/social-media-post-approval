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

export interface UploadHandle<T> {
  promise: Promise<T>;
  abort: () => void;
}

/**
 * `XMLHttpRequest` rather than `fetch` — it's the one API that reports
 * upload progress, which UI_UX_SPEC.md's editor requires a bar for.
 */
export function uploadFile<T>(
  url: string,
  file: File,
  options: {
    csrfCookieName?: string;
    onProgress?: (fraction: number) => void;
  } = {},
): UploadHandle<T> {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append("file", file);

  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", url);
    xhr.withCredentials = true;
    const headers = csrfHeaders(options.csrfCookieName);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      let json: {
        data?: T;
        error?: { code: string; message: string; details?: ApiErrorDetail[] };
      };
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        reject(
          new ApiError({ code: "UPLOAD_FAILED", message: "Upload failed." }),
        );
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.data !== undefined) {
        resolve(json.data);
      } else {
        reject(
          new ApiError(
            json.error ?? { code: "UPLOAD_FAILED", message: "Upload failed." },
          ),
        );
      }
    };
    xhr.onerror = () => {
      reject(
        new ApiError({ code: "UPLOAD_FAILED", message: "Upload failed." }),
      );
    };
    xhr.onabort = () => {
      reject(
        new ApiError({ code: "UPLOAD_FAILED", message: "Upload cancelled." }),
      );
    };
    xhr.send(formData);
  });

  return { promise, abort: () => xhr.abort() };
}
