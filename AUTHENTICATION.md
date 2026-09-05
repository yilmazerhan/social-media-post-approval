# AUTHENTICATION.md

Two authentication methods, one user model, one authorization system.

---

## 1. Principles

1. Authentication (who you are) and authorization (what you may do) are separate
   concerns with separate code. A change of identity provider never changes a
   permission decision.
2. `LOCAL` and `ENTRA_ID` users are rows in the **same** `User` table. There is
   no parallel user store.
3. Roles and permissions are always resolved from our database. Group or role
   claims arriving in a SAML assertion may *map* to internal roles when an
   administrator configures that mapping — they are never trusted directly.
4. Sessions are server-side and revocable.

---

## 2. Local authentication

### Password storage
Argon2id via `@node-rs/argon2`. Defaults, overridable per environment:

| Parameter | Default | Source |
| --- | --- | --- |
| memoryCost | 19 MiB (19456 KiB) | OWASP minimum configuration |
| timeCost | 2 | OWASP |
| parallelism | 1 | OWASP |
| hashLength | 32 bytes | |
| salt | 16 random bytes, generated per hash | |

The encoded hash string (algorithm, parameters, salt, digest) is stored in
`User.passwordHash`. Parameters can be raised later; verification detects an
outdated parameter set and transparently re-hashes on the next successful login.

Plaintext passwords are never stored, never logged, never included in an audit
payload, and never returned by any API.

### Password policy (configurable, enforced server-side)
- Minimum length `PASSWORD_MIN_LENGTH` (default 12).
- Optional character-class requirements (`PASSWORD_REQUIRE_*`).
- Rejected if it appears in a bundled local list of common passwords (no online
  breach API — the platform must work offline).
- Cannot equal the email local part or the display name.
- Last `PASSWORD_HISTORY_COUNT` hashes are kept in `User`-scoped history to
  prevent immediate reuse.
- Optional maximum age (`PASSWORD_MAX_AGE_DAYS`, 0 = disabled) sets
  `mustChangePassword`.

The same Zod schema validates the password on the client and the server; the
server's verdict is the only one that counts.

### Login flow
1. Rate limit per IP and per email (`LoginAttempt`), sliding window.
2. Look up the user by lowercased email. **Constant-time behaviour**: an unknown
   email still performs a dummy Argon2 verification so response timing does not
   leak account existence.
3. Reject when `status ∈ {DISABLED, LOCKED}` or `deletedAt` is set — with the
   same generic message as a bad password.
4. Reject when `authProvider = ENTRA_ID`: "This account signs in with your
   corporate account." (No password path exists for them, ever.)
5. Verify the hash. On failure: increment `failedLoginCount`, write a
   `LoginAttempt` and a `security` audit row; at `LOCKOUT_THRESHOLD` (default 5)
   set `lockedUntil = now + LOCKOUT_DURATION_MINUTES` (default 15).
6. On success: reset counters, rotate the session (new id — session fixation
   defence), set `lastLoginAt`, audit `AUTH_LOGIN_SUCCESS`.

### Password reset
- Request endpoint always answers with the same neutral response regardless of
  whether the email exists.
- Token: 32 cryptographically random bytes, base64url. Only its SHA-256 is
  stored. TTL `PASSWORD_RESET_TTL_MINUTES` (default 60). Single-use — `usedAt`
  is set inside the same transaction that changes the password.
- Reset is refused for `ENTRA_ID` accounts.
- Completing a reset revokes **all** of that user's sessions.
- The token appears only in the emailed link. It is never logged, never audited,
  never echoed in an API response.

### Password change (authenticated)
Requires the current password, applies the full policy, revokes every other
session of that user, and keeps the current one.

---

## 3. Microsoft Entra ID (SAML 2.0)

Service-provider-initiated SSO. The application is the SP; Entra is the IdP.

### Endpoints
| Route | Purpose |
| --- | --- |
| `GET /api/v1/auth/saml/login` | Builds the `AuthnRequest`, stores relay state, redirects to the IdP |
| `POST /api/v1/auth/saml/acs` | Assertion Consumer Service — consumes `SAMLResponse` |
| `GET /api/v1/auth/saml/metadata` | SP metadata XML for the Entra administrator |
| `GET|POST /api/v1/auth/saml/logout` | Single logout, when the IdP is configured for it |

### Response validation — all mandatory, all server-side
Handled by `@node-saml/node-saml`, with our own explicit re-assertions on top:

- XML signature valid against the configured IdP certificate; signature covers
  the assertion (and the response when `SAML_WANT_RESPONSE_SIGNED`).
- Signature algorithm allowlist — SHA-256 or stronger; SHA-1 rejected.
- `Issuer` equals the configured IdP entity id.
- `Audience` equals `SAML_ENTITY_ID`.
- `Destination` / `Recipient` equals the configured ACS URL.
- `NotBefore` / `NotOnOrAfter` valid within `SAML_CLOCK_SKEW_SECONDS`
  (default 60).
- `InResponseTo` matches a request we issued and have not yet consumed.
- **Replay protection**: assertion id inserted into `SamlReplayGuard`; a
  duplicate insert is a hard failure.
- Relay state is validated against an allowlist of internal paths — an open
  redirect through `RelayState` is not possible.
- Encrypted assertions are decrypted with the SP private key when configured.

Any failure produces a generic error page, a `security` log entry (without the
assertion body) and an `AUTH_SAML_REJECTED` audit row with the reason code.

### Identity mapping
| Internal field | Source (configurable via `SAML_ATTR_*`) |
| --- | --- |
| `externalIdentityId` | `http://schemas.microsoft.com/identity/claims/objectidentifier` — stable, never the email |
| `email` | `…/claims/emailaddress` or `NameID` |
| `firstName` / `lastName` / `displayName` | standard claim URIs |
| `jobTitle`, `department` | optional claims |
| groups | `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` |

Matching order on each login:
1. `(authProvider = ENTRA_ID, externalIdentityId)` — the authoritative key.
2. Else by email: if an existing `ENTRA_ID` user matches, bind the
   `externalIdentityId` and continue. If an existing `LOCAL` user matches,
   linking is refused unless `SAML_ALLOW_LOCAL_LINK` is explicitly enabled —
   silent account takeover through a claimed email must not be possible.
3. Else, if `SAML_JIT_PROVISIONING` is enabled, create the user with the
   configured default role; otherwise reject with "no account provisioned".

Group→role mapping is a stored administrator-managed table. It can only grant
roles that exist; anything unmapped is ignored. `ADMIN` can be excluded from
JIT mapping via `SAML_JIT_FORBID_ADMIN` (default true).

The application never stores or manages an Entra password and never shows
password UI to those users.

---

## 4. Sessions

- On successful authentication the server creates a `Session` row and issues a
  cookie containing the session id plus a random secret; only the secret's
  SHA-256 is stored. Possession of the cookie alone, without a live non-revoked
  row, is worthless.
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`,
  no `Domain` (host-only). The value is signed with `SESSION_SECRET`.
- **Absolute timeout** `SESSION_ABSOLUTE_TIMEOUT_MINUTES` (default 480) and
  **idle timeout** `SESSION_IDLE_TIMEOUT_MINUTES` (default 60). `lastSeenAt` is
  updated at most once a minute to avoid a write per request.
- Session id is rotated on login and on privilege-relevant changes.
- Revocation paths: logout, logout-all, administrator action, user disablement,
  password change/reset, role change (optional, `SESSION_REVOKE_ON_ROLE_CHANGE`).
- Every request re-reads user status; a user disabled a second ago cannot make
  one more request.
- Nothing authentication-related is ever written to `localStorage` or
  `sessionStorage`.
- Expired and revoked rows are removed by the `SESSION_CLEANUP` job.

### CSRF
Double-submit: a `csrfToken` cookie (not `HttpOnly`, per-session, random) plus
an `X-CSRF-Token` header on every unsafe request, compared in constant time.
`Origin` (falling back to `Referer`) must match `APP_URL`, and `Sec-Fetch-Site`
must not be `cross-site`. The SAML ACS endpoint is exempt from the token check
by necessity — it is protected instead by `InResponseTo`, signature validation
and replay protection.

---

## 5. Authorization (RBAC)

### Permission catalogue
```
POST_CREATE   POST_READ_OWN   POST_READ_ALL   POST_EDIT_OWN   POST_EDIT_ALL
POST_DELETE_OWN   POST_SUBMIT   POST_APPROVE   POST_REJECT
POST_REQUEST_CHANGES   POST_COMMENT   POST_CANCEL
APPROVAL_READ   APPROVAL_ASSIGN   APPROVAL_REASSIGN
USER_READ   USER_MANAGE   ROLE_MANAGE   GROUP_MANAGE   DEPARTMENT_MANAGE
REPORT_READ   AUDIT_READ
RETENTION_MANAGE   SETTINGS_MANAGE   JOB_MANAGE   EMAIL_MANAGE
```

Default grants:

| Permission group | EMPLOYEE | APPROVER | ADMIN |
| --- | :--: | :--: | :--: |
| Own posts (create/read/edit/submit/delete draft/comment) | ✓ | ✓ | ✓ |
| `POST_READ_ALL`, `APPROVAL_READ`, approve/reject/request changes | | ✓ | ✓ |
| `APPROVAL_ASSIGN`, `APPROVAL_REASSIGN` | | ✓ | ✓ |
| `REPORT_READ` | | ✓ | ✓ |
| Administration (users, roles, groups, departments, settings, retention, jobs, email, audit) | | | ✓ |

### The decision function
```ts
authorization.can(user, 'POST_APPROVE', post) // → boolean
authorization.assert(user, 'POST_APPROVE', post) // → throws ForbiddenError
```

Two stages:
1. **Grant** — does any of the user's roles hold the permission?
2. **Policy** — resource-level predicate for permissions that are scoped:
   - `POST_READ_OWN` / `POST_EDIT_OWN` → `post.creatorId === user.id`
   - `POST_APPROVE` / `POST_REJECT` / `POST_REQUEST_CHANGES` → an open
     assignment targets the user directly or through a group they belong to,
     **and** `post.creatorId !== user.id` (nobody approves their own content),
     **and** the acted-on `postVersionId` is the version under review
   - `APPROVAL_READ` → assigned, same department, or `POST_READ_ALL`
   - Administration permissions have no resource scope.

The resource is always loaded before the decision, so an IDOR attempt fails on
the policy check rather than leaking through a missing one. The same function
drives UI affordances via a serialised capability set on the page payload — the
button and the server can never disagree.

### Enforcement checklist for every protected endpoint
- [ ] session resolved and user active
- [ ] Zod-validated input
- [ ] `authorization.assert(...)` with the loaded resource
- [ ] workflow guard (state machine) where a transition is involved
- [ ] audit row written in the same transaction

---

## 6. Auditing of authentication events

`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTH_LOGOUT`, `AUTH_LOGOUT_ALL`,
`AUTH_LOCKED_OUT`, `AUTH_PASSWORD_CHANGED`, `AUTH_PASSWORD_RESET_REQUESTED`,
`AUTH_PASSWORD_RESET_COMPLETED`, `AUTH_SAML_SUCCESS`, `AUTH_SAML_REJECTED`,
`AUTH_SESSION_REVOKED`, `USER_DISABLED`, `USER_ENABLED`, `ROLE_ASSIGNED`,
`ROLE_REVOKED`.

Each row carries actor, IP, user agent and a reason code. None of them carries a
password, token, cookie or SAML assertion.

---

## 7. Testing requirements

Unit: password policy, lockout arithmetic, session expiry maths, `can()` for
every permission × role × ownership combination, SAML attribute mapping.

Integration: full local login/lockout/reset cycle against PostgreSQL; SAML
validation against recorded fixtures — valid, expired, wrong audience, wrong
issuer, wrong destination, tampered signature, replayed assertion — each must be
rejected with the right reason code.

E2E: local employee login; Entra employee login (against a stub IdP that signs
with a test certificate); disabled user cannot authenticate and their live
session dies; employee cannot approve; employee cannot open another employee's
draft; non-admin cannot reach Administration.

---

## 8. References

- OWASP Authentication Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Password Storage Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP SAML Security Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/SAML_Security_Cheat_Sheet.html
- RFC 9106 — Argon2 — https://www.rfc-editor.org/rfc/rfc9106.html
- SAML 2.0 Core (OASIS) — https://docs.oasis-open.org/security/saml/v2.0/saml-core-2.0-os.pdf
- Entra ID SAML SSO configuration — https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-saml-single-sign-on
- Entra ID SAML token claims reference — https://learn.microsoft.com/en-us/entra/identity-platform/reference-saml-tokens
- `@node-saml/node-saml` — https://github.com/node-saml/node-saml
- `@node-rs/argon2` — https://github.com/napi-rs/node-rs/tree/main/packages/argon2
