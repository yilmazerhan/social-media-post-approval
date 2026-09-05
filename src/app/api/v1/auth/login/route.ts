import { NextRequest } from "next/server";
import { z } from "zod";
import { config } from "@/server/config";
import { jsonError, jsonSuccess } from "@/server/http/envelope";
import {
  verifyCsrf,
  generateCsrfToken,
  csrfCookieAttributes,
} from "@/server/http/csrf";
import { getClientIp, getUserAgent } from "@/server/http/request-context";
import {
  loginLocal,
  InvalidCredentialsError,
  AccountLockedError,
  ProviderMismatchError,
  RateLimitedError,
} from "@/modules/auth/local";
import {
  createSession,
  SESSION_COOKIE_NAME,
  sessionCookieAttributes,
} from "@/modules/auth/session";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!verifyCsrf(request, { requireToken: false })) {
    return jsonError(403, "CSRF_FAILED", "Request could not be verified.");
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      422,
      "VALIDATION_FAILED",
      "Some fields need attention.",
      parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  const ipAddress = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    const user = await loginLocal({
      email: parsed.data.email,
      password: parsed.data.password,
      ipAddress,
      userAgent,
    });
    const { cookieValue } = await createSession({
      userId: user.id,
      authProvider: "LOCAL",
      ipAddress,
      userAgent,
    });

    const response = jsonSuccess({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
      ...sessionCookieAttributes,
      maxAge: config.SESSION_ABSOLUTE_TIMEOUT_MINUTES * 60,
    });
    response.cookies.set(
      config.CSRF_COOKIE_NAME,
      generateCsrfToken(),
      csrfCookieAttributes,
    );
    return response;
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return jsonError(429, "RATE_LIMITED", err.message);
    }
    if (err instanceof AccountLockedError) {
      return jsonError(403, "ACCOUNT_LOCKED", err.message);
    }
    if (err instanceof ProviderMismatchError) {
      return jsonError(403, "PROVIDER_MISMATCH", err.message);
    }
    if (err instanceof InvalidCredentialsError) {
      return jsonError(401, "UNAUTHENTICATED", err.message);
    }
    throw err;
  }
}
