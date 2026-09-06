import { NextRequest } from "next/server";
import { z } from "zod";
import { config } from "@/server/config";
import { jsonError, jsonSuccess } from "@/server/http/envelope";
import { verifyCsrf } from "@/server/http/csrf";
import { checkRateLimit } from "@/server/http/rate-limit";
import { getClientIp } from "@/server/http/request-context";
import { requestPasswordReset } from "@/modules/auth/local";

const bodySchema = z.object({ email: z.string().email() });

/** Always the same response, regardless of whether the email exists — AUTHENTICATION.md §2. */
const NEUTRAL_MESSAGE =
  "If an account exists for that email, a reset link has been sent.";

export async function POST(request: NextRequest) {
  if (!verifyCsrf(request, { requireToken: false })) {
    return jsonError(403, "CSRF_FAILED", "Request could not be verified.");
  }

  const ipAddress = getClientIp(request);
  const rateLimitKey = `password-forgot:${ipAddress ?? "unknown"}`;
  if (
    !checkRateLimit(
      rateLimitKey,
      config.RATE_LIMIT_AUTH_MAX,
      config.RATE_LIMIT_AUTH_WINDOW_MINUTES * 60_000,
    )
  ) {
    return jsonError(
      429,
      "RATE_LIMITED",
      "Too many attempts. Try again later.",
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      422,
      "VALIDATION_FAILED",
      "Enter a valid email address.",
      parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  await requestPasswordReset(parsed.data.email, ipAddress);

  return jsonSuccess({ message: NEUTRAL_MESSAGE });
}
