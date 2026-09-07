import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/server/http/envelope";
import { verifyCsrf } from "@/server/http/csrf";
import { getSessionContext } from "@/server/http/request-context";
import {
  changePassword,
  InvalidCredentialsError,
  PasswordPolicyError,
} from "@/modules/auth/local";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!verifyCsrf(request, { requireToken: true })) {
    return jsonError(403, "CSRF_FAILED", "Request could not be verified.");
  }

  const context = await getSessionContext(request);
  if (!context) {
    return jsonError(401, "UNAUTHENTICATED", "Sign in to continue.");
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
    await changePassword({
      userId: context.user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      keepSessionId: context.session.id,
    });
    return jsonSuccess({ changed: true });
  } catch (err) {
    if (err instanceof PasswordPolicyError) {
      return jsonError(
        422,
        "VALIDATION_FAILED",
        "Password does not meet policy.",
        err.violations.map((message) => ({ field: "newPassword", message })),
      );
    }
    if (err instanceof InvalidCredentialsError) {
      return jsonError(
        401,
        "UNAUTHENTICATED",
        "Current password is incorrect.",
      );
    }
    throw err;
  }
}
