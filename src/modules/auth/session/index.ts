/**
 * Server-side session issuance, validation and revocation. See AUTHENTICATION.md §4.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  createSession,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
  type RevokedReason,
  type ValidSession,
} from "./session-service";
export { SESSION_COOKIE_NAME, sessionCookieAttributes } from "./cookie";
