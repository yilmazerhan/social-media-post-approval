import { NextRequest } from "next/server";
import { z } from "zod";
import { config } from "@/server/config";
import { jsonError, jsonSuccess } from "@/server/http/envelope";
import { verifyCsrf } from "@/server/http/csrf";
import { checkRateLimit } from "@/server/http/rate-limit";
import { getClientIp } from "@/server/http/request-context";
import {
  completePasswordReset,
  InvalidResetTokenError,
  PasswordPolicyError,
} from "@/modules/auth/local";

const bodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!verifyCsrf(request, { requireToken: false })) {
    return jsonError(403, "CSRF_FAILED", "Request could not be verified.");
  }

  const ipAddress = getClientIp(request);
  const rateLimitKey = `password-reset:${ipAddress ?? "unknown"}`;
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
      "Some fields need attention.",
      parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  try {
    await completePasswordReset(parsed.data.token, parsed.data.newPassword);
    return jsonSuccess({ reset: true });
  } catch (err) {
    if (err instanceof PasswordPolicyError) {
      return jsonError(
        422,
        "VALIDATION_FAILED",
        "Password does not meet policy.",
        err.violations.map((message) => ({ field: "newPassword", message })),
      );
    }
    if (err instanceof InvalidResetTokenError) {
      return jsonError(400, "VALIDATION_FAILED", err.message);
    }
    throw err;
  }
}
