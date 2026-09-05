/** Typed failures the login/reset/change flows can raise — route handlers map these to API.md's error codes. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Incorrect email or password.");
  }
}

export class ProviderMismatchError extends Error {
  constructor() {
    super("This account signs in with your corporate account.");
  }
}

export class AccountLockedError extends Error {
  constructor(public readonly lockedUntil: Date) {
    super(
      "This account is temporarily locked due to repeated failed sign-in attempts.",
    );
  }
}

export class RateLimitedError extends Error {
  constructor() {
    super("Too many attempts. Try again later.");
  }
}

export class PasswordPolicyError extends Error {
  constructor(public readonly violations: string[]) {
    super("Password does not meet policy.");
  }
}

export class InvalidResetTokenError extends Error {
  constructor() {
    super("This password reset link is invalid or has expired.");
  }
}
