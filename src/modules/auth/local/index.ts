/**
 * Local username/password authentication — Argon2id, lockout, policy. See AUTHENTICATION.md §2.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export { hashPassword, verifyPassword, needsRehash } from "./password";
export { checkPasswordPolicy } from "./password-policy";
export { loginLocal, type LoginInput } from "./login";
export { requestPasswordReset, completePasswordReset } from "./password-reset";
export { changePassword } from "./password-change";
export {
  InvalidCredentialsError,
  ProviderMismatchError,
  AccountLockedError,
  RateLimitedError,
  PasswordPolicyError,
  InvalidResetTokenError,
} from "./errors";
