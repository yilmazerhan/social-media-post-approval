# SECURITY.md

Security is a functional requirement here, not a hardening pass at the end. This
document maps each threat to the control that answers it and to the test that
proves it.

---

## 1. Trust boundaries

| Boundary | Assumption |
| --- | --- |
| Browser → Nginx | Untrusted input. TLS terminated here. |
| Nginx → app | Private network. Nginx sets `X-Forwarded-*`; the app trusts them **only** when `TRUST_PROXY=true`, and reads the client IP from the configured hop count. |
| App → PostgreSQL | Private network, credentialled, least-privilege role. |
| App → filesystem | Confined to `STORAGE_PATH`; every key is normalised and re-checked. |
| App ↔ Entra ID | Untrusted assertions until every validation in [AUTHENTICATION.md](./AUTHENTICATION.md) passes. |
| Worker → SMTP | Outbound only, credentials from environment, TLS per configuration. |

The application makes **no** other outbound connection. No update check, no
telemetry, no font or script fetch. An egress firewall permitting only the SMTP
host and the Entra endpoints is a supported and recommended deployment.

---

## 2. Threat → control

| Threat | Control | Verified by |
| --- | --- | --- |
| SQL injection | Prisma parameterised queries; raw SQL only with `$queryRaw` tagged templates; no string concatenation into SQL | code review + integration tests |
| XSS (stored) | Editor HTML is regenerated **server-side** from Tiptap JSON and sanitized with a strict allowlist; client HTML is never trusted or rendered raw | unit tests with hostile payload fixtures |
| XSS (reflected/DOM) | React escaping; `dangerouslySetInnerHTML` only for sanitized post HTML, behind one reviewed component; strict CSP without `unsafe-eval` | CSP header test, axe/E2E |
| CSRF | Double-submit token + `Origin`/`Sec-Fetch-Site` checks + `SameSite=Lax` cookies | integration test per unsafe method |
| Session fixation | Session id rotated on login and privilege change | integration test |
| Session theft | `HttpOnly`, `Secure`, host-only cookies; server-side revocable rows; idle + absolute timeouts | integration test |
| Brute force | Per-IP and per-account rate limits, progressive lockout, constant-time responses for unknown accounts | integration test |
| Account enumeration | Identical responses and timing for unknown email, wrong password, disabled account; neutral password-reset response | integration test |
| IDOR | Resource loaded before the authorization decision; `404` rather than `403` when the object is not visible at all | E2E negative cases |
| Privilege escalation | Server-side `can()` on every endpoint; SAML group claims mapped only to configured roles; `ADMIN` excluded from JIT mapping by default | unit matrix + E2E |
| Unauthorized approval | Assignment policy + creator≠approver rule + version match + transactional state machine | unit + E2E |
| Stale/duplicate approval | Optimistic locking, `SELECT … FOR UPDATE`, `postVersionId` match, idempotency keys | integration test |
| Insecure upload | Extension allowlist, declared-MIME check, magic-byte sniff, SVG rejected, images re-encoded through Sharp, video probed with ffprobe, size cap enforced while streaming | integration test with crafted files |
| Path traversal | Opaque generated storage keys; resolved path must stay under `STORAGE_PATH`; user filenames never touch the filesystem | unit test with `../` payloads |
| Unauthorized file access | Files served only via authenticated endpoints that authorize against the owning post | E2E |
| Malicious file execution | Storage directory is not web-served; downloads carry `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` | header test |
| SSRF | The application never fetches a user-supplied URL. No proxying, no link unfurling, no remote image loading | code review |
| Open redirect | Post-login and SAML `RelayState` targets validated against an internal path allowlist | unit test |
| CSV/formula injection | Leading `= + - @ \t \r` prefixed with `'` in exports | unit test |
| Denial of service | Nginx body limits, upload caps, pagination caps, rate limits, query timeouts, job `maxAttempts` | load smoke test |
| Secret leakage | Pino redaction list; audit metadata allowlist; `isSecret` settings excluded from responses; `.env` never committed | log assertions |
| Dependency risk | `npm audit` in CI, lockfile committed, no CDN loading, pinned base images | CI |
| Insider tampering | Append-only `AuditLog` with `INSERT`/`SELECT` grants only; immutable `PostVersion` and `ApprovalAction` | DB grant test |

---

## 3. HTTP security headers

Set at Nginx and asserted by the application's middleware (defence in depth):

```
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(),
                    usb=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

CSP, written for this application rather than copied from a template:

```
default-src 'self';
script-src 'self' 'nonce-<per-request>';
style-src 'self' 'nonce-<per-request>';
img-src 'self' blob: data:;
media-src 'self' blob:;
font-src 'self';
connect-src 'self';
form-action 'self' <IdP SSO origin, when SAML is enabled>;
frame-ancestors 'none';
base-uri 'self';
object-src 'none';
upgrade-insecure-requests
```

`unsafe-inline` and `unsafe-eval` are not used; Next.js scripts carry a
per-request nonce. `form-action` includes the Entra login origin only because
SP-initiated SSO posts there. `data:` in `img-src` covers editor paste previews;
if that proves unnecessary during implementation, it is removed.

CORS: the API is same-origin only. No `Access-Control-Allow-Origin` is emitted.

---

## 4. Secrets

- `SESSION_SECRET`, `SMTP_PASSWORD`, `DATABASE_URL`, SAML SP private key: from
  the environment, or from files referenced by `*_FILE` variables so Docker/
  Podman secrets can be used.
- Minimum entropy is enforced at startup (`SESSION_SECRET` ≥ 32 bytes); a
  default or example value in production is a fatal startup error.
- Rotation: `SESSION_SECRET` rotation invalidates sessions by design and is
  documented in [DEPLOYMENT.md](./DEPLOYMENT.md).
- `.env` is git-ignored; only `.env.example` with placeholder values is
  committed. CI fails on a detected secret pattern.

---

## 5. Data protection

- Passwords: Argon2id only. No reversible storage, ever.
- Tokens (password reset, session secret): stored as SHA-256, compared in
  constant time.
- Transport: HTTPS mandatory in production; HTTP redirects to HTTPS; HSTS as
  above. Customer-provided certificate, key and chain are supported; Let's
  Encrypt is documented as optional, never required.
- At rest: full-disk or PostgreSQL-level encryption is the customer's choice and
  is documented, not embedded.
- Uploaded files carry no security-relevant metadata; images are re-encoded,
  which strips EXIF including GPS.
- Retention limits how long content, logs and email records persist, configured
  per entity — deletion is a privacy control here, not just housekeeping.

---

## 6. Database privileges

Two roles:

| Role | Grants |
| --- | --- |
| `app` (runtime) | `SELECT, INSERT, UPDATE, DELETE` on business tables; `SELECT, INSERT` only on `AuditLog`; `SELECT, INSERT, DELETE` on `PostVersion` and `ApprovalAction` (delete reserved for retention run under the maintenance role in strict deployments) |
| `migrator` / `maintenance` | DDL, migrations, retention hard-deletes |

Documented as the recommended configuration; a single-role deployment still
works but loses the append-only guarantee at the database level.

---

## 7. Logging discipline

Never logged, in any category, at any level: passwords, password hashes, session
cookies or ids, CSRF tokens, reset tokens, SAML assertions or `SAMLResponse`
bodies, SMTP credentials, `DATABASE_URL`, full request bodies of auth endpoints.

Security-relevant events go to the `security` logger *and* to `AuditLog`. Log
files are the operational record; the audit table is the authoritative one.

---

## 8. Secure development practice

- TypeScript strict, ESLint with security-relevant rules, Prettier — enforced in
  CI, not by convention.
- Dependency review on every addition: is it maintained, does it phone home,
  does it need native build tools at runtime?
- `npm audit --omit=dev` gate in CI; a documented exception process for
  unavoidable advisories.
- Container images: pinned digests, multi-stage build, non-root user, no shell
  utilities beyond what runtime needs, read-only root filesystem where possible.
- A security review is a named phase (Phase 25) with its own checklist, not an
  afterthought.

---

## 9. Vulnerability reporting

Internal deployment: report to the platform owner through the internal channel
documented in the customer's runbook. Include version, environment and
reproduction steps. Do not attach production content or logs containing personal
data.

---

## 10. References

- OWASP Top 10 (2021) — https://owasp.org/Top10/
- OWASP ASVS — https://owasp.org/www-project-application-security-verification-standard/
- OWASP Cheat Sheet Series — https://cheatsheetseries.owasp.org/
- OWASP File Upload Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- MDN Content Security Policy — https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- MDN Set-Cookie / SameSite — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
- Next.js CSP guide — https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
- CIS Docker Benchmark — https://www.cisecurity.org/benchmark/docker
