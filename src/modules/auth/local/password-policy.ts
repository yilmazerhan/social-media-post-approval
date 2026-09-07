/**
 * Password policy — AUTHENTICATION.md §2. Length and character-class rules
 * only; the common-password list and password-history checks described
 * there land with the rest of the login/reset flow in Phase 4, once a
 * PasswordHistory table exists to back them.
 */
import { config } from "@/server/config";

export function checkPasswordPolicy(
  password: string,
  context: { email?: string; displayName?: string } = {},
): string[] {
  const violations: string[] = [];

  if (password.length < config.PASSWORD_MIN_LENGTH) {
    violations.push(
      `Must be at least ${config.PASSWORD_MIN_LENGTH} characters.`,
    );
  }
  if (config.PASSWORD_REQUIRE_UPPER && !/[A-Z]/.test(password)) {
    violations.push("Must contain an uppercase letter.");
  }
  if (config.PASSWORD_REQUIRE_LOWER && !/[a-z]/.test(password)) {
    violations.push("Must contain a lowercase letter.");
  }
  if (config.PASSWORD_REQUIRE_DIGIT && !/[0-9]/.test(password)) {
    violations.push("Must contain a digit.");
  }
  if (config.PASSWORD_REQUIRE_SYMBOL && !/[^A-Za-z0-9]/.test(password)) {
    violations.push("Must contain a symbol.");
  }

  const localPart = context.email?.split("@")[0]?.toLowerCase();
  if (
    localPart &&
    localPart.length > 2 &&
    password.toLowerCase().includes(localPart)
  ) {
    violations.push("Must not contain your email address.");
  }
  if (
    context.displayName &&
    context.displayName.length > 2 &&
    password.toLowerCase().includes(context.displayName.toLowerCase())
  ) {
    violations.push("Must not contain your name.");
  }

  return violations;
}
