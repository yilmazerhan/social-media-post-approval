# IMPLEMENTATION_PLAN.md

The build order, what "done" means at each step, and where we currently are.
The 28 phases from the master specification are grouped into seven milestones so
progress is reviewable in meaningful chunks rather than one uncontrolled change.

**Current status: Phase 6 complete — awaiting the go-ahead to start Phase 7.**

---

## Ground rules for every phase

1. Read [CLAUDE.md](./CLAUDE.md) and the documents it points to before writing
   code. The architecture is decided; deviating from it needs a documented
   reason and an ADR entry in [ARCHITECTURE.md](./ARCHITECTURE.md).
2. Each phase ends with: the app running, its tests written **and passing**,
   migrations applied cleanly from scratch, no TypeScript or ESLint errors, no
   console or server errors on the touched screens, and responsive behaviour
   checked at the four breakpoints.
3. Each phase closes with a short report: what was implemented, which files
   changed, which tests ran and their result, what remains, and any decision
   taken.
4. Nothing is silently skipped. If something in the specification cannot be
   built as written, it is raised and recorded — not quietly dropped.
5. Commits are small and scoped, on the branch
   `claude/new-project-setup-l8qu2f`.

---

## Milestone 0 — Foundation (Phases 1–3)

### Phase 1 · Architecture and technology decisions — **complete**

Delivered: `ARCHITECTURE.md`, `DATABASE.md`, `AUTHENTICATION.md`, `API.md`,
`UI_UX_SPEC.md`, `SECURITY.md`, `CONFIGURATION.md`, `DEPLOYMENT.md`,
`BACKUP_RESTORE.md`, `README.md`, `CLAUDE.md`, this plan. Nine ADRs recorded.

### Phase 2 · Project skeleton and development environment — **complete**

Delivered: Next.js 15.5 (App Router, Turbopack) + React 19 + TypeScript 5
strict, `npm` with a committed lockfile. Tailwind v4 + a hand-authored
shadcn/ui foundation (`components.json`, `cn()`, cva-based `Button`) on
Radix + Lucide, with the full light/dark token layer from `UI_UX_SPEC.md`
§2 and self-hosted Inter via `@fontsource` (no Google Fonts request, build
or runtime). ESLint (flat config + `eslint-config-prettier`) and Prettier
(with `prettier-plugin-tailwindcss`) both clean; `tsc --noEmit` clean under
strict mode. npm scripts: `dev`, `build`, `start`, `worker`, `lint`,
`lint:fix`, `format`, `format:check`, `typecheck`, `test`, `test:watch`,
`test:e2e` — all functional. `db:*` and `job:enqueue` are deferred to
Phase 3, where Prisma and the `BackgroundJob` table give them something
real to run against; adding them now would have meant scripts that fail
the moment they're invoked.

`src/server/config.ts` implements every variable in `CONFIGURATION.md` as
a single Zod schema (`<NAME>_FILE` file-secret support, cross-field
refinements for SAML-conditional requirements and production-only checks,
a redacted boot-time summary) and is wired into Next.js startup via
`src/instrumentation.ts`, so both `next dev`/`next start` and
`npm run worker` fail fast with a readable, field-by-field message before
serving a single request. `src/server/logger.ts` provides the six Pino
child loggers (`app`, `security`, `auth`, `audit`, `worker`, `http`) with
the redaction list from `SECURITY.md` §7, verified to redact nested
fields. `docker-compose.dev.yml` runs PostgreSQL 16 for local development
(validated with `docker compose config`; a real Postgres 16 instance was
also used directly in this sandbox to exercise the config/worker/tests).
The full `src/modules/*` boundary skeleton exists per `ARCHITECTURE.md`
§2, each with a one-line `index.ts` public-surface stub, plus
`src/jobs/worker.ts` (a real, config-validated, signal-handling process)
and `src/jobs/scheduler.ts` (stub — real schedule evaluation needs
Phase 3's database). Vitest (jsdom + Testing Library) and Playwright
(against the pre-installed Chromium) are configured with 10 tests across
three files: `cn()` behaviour, a `Button` interaction test, and five
integration tests spawning the real config module as a subprocess to
prove the fail-fast contract (missing `SESSION_SECRET`, missing
`APP_URL`, a placeholder secret in production, SAML enabled without its
required fields, and a clean successful boot that never prints a secret).

- **Exit — verified**: `npm run dev` serves the placeholder shell (`curl`
  returns `200` and the rendered `<h1>Content Approval</h1>`); `lint`,
  `typecheck`, `test`, `format:check`, `build` and `test:e2e` are all green;
  a missing `SESSION_SECRET` exits non-zero with `SESSION_SECRET` named in
  the error, both as a manual check and as an automated test.

### Phase 3 · Database and migrations — **complete**

Delivered: Prisma 7.10 (stable; `latest` currently points at an 8.0 release
candidate, so 7.10 was pinned deliberately) with the `@prisma/adapter-pg`
driver adapter, which v7 requires for SQL connections. `prisma/schema.prisma`
implements every enum and model in `DATABASE.md` §2–7 — all relations
explicitly named and `onDelete` policies set per §8, every foreign key
indexed. One migration (`20260905094359_init`) carries the generated DDL
plus everything Prisma's schema language can't express, added as raw SQL:
the `citext`/`pg_trgm`/`pgcrypto` extensions, the two `User` CHECK
constraints, the `ApprovalAssignment` one-target CHECK and its one-open-
assignment-per-post partial unique index, the `ApprovalAction`
comment-required CHECK, `SlaPolicy`'s three-tier partial-unique scheme
(department+priority, priority-only, global-default — each needed because
a plain composite unique constraint can't express "unique except when
null" the way Postgres already does for the `User`
`(authProvider, externalIdentityId)` pair, which turned out to need no
raw SQL at all), trigram GIN indexes on `User.displayName`/`email`, and a
`BEFORE INSERT OR UPDATE` trigger maintaining `Post.searchVector` (safe
from recursion because it sets `NEW` directly rather than issuing a
second `UPDATE`, and correct because `PostVersion` is immutable — the
search text can only change when `title` or `currentVersionId` does).
Database-role grants for append-only enforcement are deliberately **not**
in this migration: they depend on a restricted production role that
doesn't exist in dev/CI, and belong with the rest of the security posture
in Phase 25 / `DEPLOYMENT.md` instead of risking the shared dev/seed/test
role's own access.

`src/server/db.ts` is the Prisma client singleton (cached on `globalThis`
in development), configured from `src/server/config.ts`'s
`DATABASE_POOL_SIZE`/`DATABASE_CONNECT_TIMEOUT`/`DATABASE_STATEMENT_TIMEOUT_MS`/
`DATABASE_SSL*`. No hand-written transaction wrapper — `prisma.$transaction`
is used directly at call sites, which already covers what one would add.
`prisma/lib/bootstrap-system-data.ts` is the shared, upsert-based baseline
(permissions, the three system roles, SLA policies, retention policies,
email templates, job schedules, a catch-all approval rule) used by both
`npm run db:bootstrap` (production-safe, creates the first `ADMIN` account,
refuses to run twice, supports non-interactive
`BOOTSTRAP_ADMIN_EMAIL`/`_PASSWORD` for provisioning scripts) and
`npm run db:seed` (development-only, refuses under `NODE_ENV=production`;
adds four departments, an approval group, the three demo users, a
department-scoped approval rule, and the "Introducing Kron PAM 4.0" hero
fixture — three versions, two rounds of `REQUEST_CHANGES` with real
reviewer comments, an image and a video attachment, and an open
`IN_PROGRESS` assignment with `dueAt` six hours out and an eighteen-hour
wait). `src/modules/auth/local/` gained real (not stubbed) Argon2id
hashing and password-policy checking, since the bootstrap/seed scripts
have no other legitimate way to create real accounts — the common-password
list and password-history checks in `AUTHENTICATION.md` §2 are left for
Phase 4, where a `PasswordHistory` table would need to be added.
`src/jobs/enqueue-cli.ts` gives `job:enqueue` a real target now that
`BackgroundJob` exists, idempotent per calendar minute.

- **Exit — verified**: migrations apply cleanly to a fully dropped and
  recreated database in one pass; `db:bootstrap` creates the admin once and
  refuses a second run; `db:seed` run twice back-to-back leaves every row
  count unchanged (including the hero post, matched by its `reference`) and
  the demo password it prints actually authenticates; 25 automated tests
  (12 of them exercising the constraints above against the real
  `content_approval_test` database — duplicate email rejected case-
  insensitively, Entra user cannot hold a password hash, LOCAL user needs a
  password unless `PENDING`, exactly one of user/group on an assignment,
  one open assignment per post, mandatory comment on `REQUEST_CHANGES`/
  `REJECT`, all three `SlaPolicy` uniqueness tiers) pass repeatably across
  three consecutive runs; `lint`, `typecheck`, `format:check`, `build` and
  `test:e2e` are all still green.

---

## Milestone 1 — Identity (Phases 4–5)

### Phase 4 · Authentication — **complete**

Delivered: `modules/auth/local` — Argon2id via `@node-rs/argon2` (ADR-004,
parameters from config so they can be raised later without a code change,
`needsRehash` transparently upgrades a login's hash in place), a
length/case/digit policy plus an email-local-part/display-name substring
check, `loginLocal` (constant-shape rejection for an unknown email via a
cached dummy-hash verify, so response timing can't reveal account
existence), lockout (`LOCKOUT_THRESHOLD` failures locks for
`LOCKOUT_DURATION_MINUTES`, durable via `User.failedLoginCount`/`lockedUntil`
rather than in memory) and a separate, durable rate limit (`LoginAttempt`
rows counted by email _and_ by IP over `RATE_LIMIT_AUTH_WINDOW_MINUTES`),
`requestPasswordReset`/`completePasswordReset` (single-use hashed tokens,
real `BackgroundJob` `EMAIL_SEND` enqueue, every other session revoked on
completion), and `changePassword` (revokes every other session while
keeping the caller's). `modules/auth/session` — sessions are database rows,
not stateless tokens: the cookie encodes `sessionId.secret`, only the
secret's SHA-256 is ever persisted, `validateSession` enforces absolute and
idle timeout and dies immediately for a revoked, disabled or deleted user,
refusing to leave a live cookie behind.

`modules/auth/saml` implements Entra ID SAML 2.0 (ADR-003) against
`@node-saml/node-saml`: metadata, SP-initiated `AuthnRequest`, and an ACS
validation chain covering signature, issuer/audience, timestamps and clock
skew (node-saml), `InResponseTo` binding, signature-algorithm floor and
replay. `InResponseTo` is bound statelessly via a signed, HMAC'd
`RelayState` carrying the request ID and post-login redirect path, rather
than node-saml's own cache provider — which would need a shared, durable
store across replicas — a decision recorded in `config.ts`'s comments.
Replay is enforced with a real unique-constraint table
(`SamlReplayGuard.assertionId`), not an in-memory set. JIT provisioning
grants exactly the one configured default role; group→role mapping and
department auto-linking need administrator-managed tables `DATABASE.md`
doesn't define yet, so both stay deferred to Phase 5/21, matching Phase 3's
existing password-history deferral below. Building the SAML integration
tests (see Exit) surfaced and fixed a real bug: the SHA-1/DSA-SHA1 veto was
checking `profile.getAssertionXml()`, whose content has already had its
`<Signature>` element stripped out by the enveloped-signature transform
node-saml verified it through — meaning the veto could never fire. It now
reads the same, already-verified assertion from the raw, undamaged
`profile.getSamlResponseXml()` instead.

12 route handlers under `/api/v1/auth` (login, logout, logout-all, session,
sessions list/revoke-one, password change/forgot/reset, SAML
login/acs/metadata) sit behind `src/server/http/envelope.ts` (API.md's
success/error envelope) and `csrf.ts`. CSRF is a double-submit cookie plus
an Origin/`Sec-Fetch-Site` check, split via a `requireToken: boolean`: a
fresh, unauthenticated visitor cannot hold a CSRF cookie before their first
login request, so login/forgot/reset accept the Origin check alone, while
every endpoint that acts on an existing session requires the token too. The
SAML ACS endpoint skips CSRF entirely and says why in comments — the POST
to it is a legitimate cross-origin request from the IdP. Login, forgot-
password and reset-password got hand-authored shadcn-style pages (the
shadcn CLI itself is blocked by this sandbox's network policy, as in
Phase 2) using React Hook Form + Zod and a small shared `postJson`/`ApiError`
client wrapper; forgot-password shows the same neutral confirmation
regardless of whether the email exists, masking existence but not
request-shape validity (a malformed address still gets a real 422).

Not resolved this phase, carried forward explicitly rather than silently
dropped: `AUTHENTICATION.md` §2's common-password-list and password-history
checks still have no `PasswordHistory` table to back them — `DATABASE.md`
doesn't define one, so adding it needs a schema decision (and a bundled
word list) made deliberately rather than bolted on here.

- **Exit — verified**: `tests/integration/local-auth.test.ts` (17 tests)
  proves the full local flow end to end against the real test database —
  successful login resets counters and audits, a wrong password increments
  `failedLoginCount`, five straight failures lock the account and a sixth
  attempt with the _correct_ password still fails, an unknown email and a
  disabled account both fail identically to a valid account with a bad
  password, the full request → reset → login-with-new-password round trip
  works with the token proven single-use, and `changePassword` revokes
  every other session while keeping the caller's. The Phase 4 exit
  criterion itself — a disabled user's live session dies on the very next
  request — is asserted directly: `validateSession` succeeds, the account
  is disabled out from under it, and the same cookie is rejected and its
  session revoked (`USER_DISABLED`) on the next call; expired and
  idle-timed-out sessions are covered the same way. `tests/integration/
saml-acs.test.ts` (14 tests) signs fake IdP responses with a throwaway
  key pair (`tests/fixtures/saml`) and drives every documented rejection
  reason to its exact code — `RELAY_STATE_INVALID`, `IN_RESPONSE_TO_MISMATCH`,
  `VALIDATION_FAILED` (tampered signature, expired assertion, wrong
  audience, unsigned assertion — four independent ways to reach it),
  `WEAK_SIGNATURE_ALGORITHM`, `REPLAYED`, `ATTRIBUTE_MAPPING_FAILED`,
  `ACCOUNT_INACTIVE`, `LOCAL_LINK_FORBIDDEN`, `NO_ACCOUNT_PROVISIONED` — plus
  the happy path (JIT-provisions a user, grants the default role, creates a
  session). `NO_PROFILE` and `MISSING_ASSERTION_ID` are defense-in-depth
  branches that reading node-saml's source shows can't be reached by an
  actual signed response; `tests/unit/signature-check.test.ts` covers their
  extraction helpers directly instead, with a comment explaining why. 64
  automated tests pass repeatably across three consecutive runs; `lint`,
  `typecheck`, `format:check` and `build` are all still clean.

### Phase 5 · RBAC and authorization — **complete**

Delivered: the permission catalogue (`src/modules/authorization/permissions.ts`)
is now the single source of truth — a `PERMISSIONS` const array plus the
derived `PermissionKey` union type — and `prisma/lib/bootstrap-system-data.ts`
imports it instead of keeping its own copy, so the database and the type
system can never drift apart; its `ROLES`/`EMPLOYEE_PERMISSIONS`/
`APPROVER_PERMISSIONS`/`ADMIN_PERMISSIONS` are now typed `PermissionKey[]`
too, so a typo in a default grant is a compile error instead of a silent
no-op. `modules/authorization` implements AUTHENTICATION.md §5 exactly:
`can`/`assert` are pure, synchronous decision functions — a grant check
first, then (only for the three permission groups the spec scopes) a
resource policy — `checkOwnedPost` (`POST_READ_OWN`/`POST_EDIT_OWN` against
`creatorId`), `checkApprovalAction` (`POST_APPROVE`/`POST_REJECT`/
`POST_REQUEST_CHANGES` against an _open_ assignment — PENDING or
IN_PROGRESS, matching the partial unique index from Phase 3 exactly —
targeting the user directly or via a group, on the version under review,
never the post's own creator), and `checkApprovalRead` (`APPROVAL_READ`:
assigned, same department, or a `POST_READ_ALL` bypass). Every other
catalogued permission is grant-only by design, per spec — not an
oversight; nothing invents a policy AUTHENTICATION.md doesn't document.
`loadAuthorizedUser(userId)` resolves granted permissions, group
membership and department in one shot so a decision never triggers a
surprise query, and `serializeGrants` turns the grant-only half into a
plain `Record<PermissionKey, boolean>` for UI nav gating — "the button and
the server can never disagree" because both read the same resolved set.

`src/server/http/handler.ts` is the reusable wrapper ARCHITECTURE.md §3
names: `protectedHandler(options, execute)` resolves the session (401),
checks CSRF (403, `requireToken: true` by default — every route behind it
acts on an existing session), parses and validates the body with Zod
(422, matching Phase 4's existing detail shape exactly), optionally loads
the acted-on resource (404 if it resolves to nothing, _before_ ever
reaching authorization — an IDOR attempt fails on a loaded check, never a
missing one), asserts the permission (403), and runs an optional workflow
guard (409, with the specific `INVALID_TRANSITION`/`ALREADY_DECIDED`/
`STALE_RESOURCE` code) before calling `execute`. Execute — and any audit
row it writes inside its own transaction — stays the caller's job, exactly
as CLAUDE.md's house rule and ARCHITECTURE.md's "the service owns the
transaction" both already say; the wrapper only owns the cross-cutting
steps ahead of it. No endpoint uses this yet: Posts and Approvals don't
exist until Phase 8/11, and the 12 auth endpoints from Phase 4 are all
self-service (session/password management) and correspond to no
catalogued permission, so "every existing endpoint goes through `assert`"
holds vacuously today — a scoping fact worth recording, not a shortcut.
The wrapper is instead proven directly, the same way Phase 4 proved
`processSamlAcs` before any UI called it.

- **Exit — verified**: `tests/unit/authorization.test.ts` (24 tests) is the
  permission × role × ownership matrix — every grant-only permission
  denied/allowed by grant alone, both scoped-permission policies exercised
  through every branch (owned vs. cross-user, direct vs. group assignment,
  self-approval always denied, non-open statuses denied, wrong-version
  denied, no-assignment denied, department/POST_READ_ALL/assignment paths
  for `APPROVAL_READ`), and the EMPLOYEE/APPROVER/ADMIN default grants
  checked against AUTHENTICATION.md's table directly — plus the two exact
  scenarios the exit criteria name: an employee denied `POST_APPROVE`
  because the grant itself is absent, and cross-user draft access denied
  despite holding `POST_EDIT_OWN`. `tests/integration/authorization-
roles.test.ts` (7 tests) re-proves the same grants against the real
  seeded `RolePermission` rows (catching drift a unit test against the
  `ROLES` constant alone couldn't) and exercises `loadAuthorizedUser`'s
  actual query path — permissions, department and group membership — over
  real users. `tests/integration/protected-handler.test.ts` (12 tests)
  drives the wrapper through real `NextRequest`s end to end: 401
  unauthenticated, 403 missing CSRF token, 422 invalid body, 404 an
  unresolved resource, 403 cross-user draft access and employee-cannot-
  approve (again, now through the full HTTP pipeline), 200 on success, 404
  and 409 from thrown `NotFoundError`/`WorkflowError`, and a 500 that logs
  the real error but never leaks it to the client. 107 automated tests
  pass repeatably across three consecutive runs; `lint`, `typecheck`,
  `format:check`, `build` and `test:e2e` are all still clean.

---

## Milestone 2 — Shell and content (Phases 6–10)

### Phase 6 · Application shell and design system — **complete**

Delivered: the shadcn primitives Phase 2 didn't yet need — `avatar`,
`separator`, `tooltip`, `dialog`, `sheet` (a Dialog-based slide-over,
reused for the mobile nav drawer), `dropdown-menu`, `badge`, `table`, and
a Radix-based `toast`/`toaster`/`useToast` — plus the app-level layer
`UI_UX_SPEC.md` §2 names for Phase 6 specifically: `StatusBadge` and
`PriorityBadge` (colour _and_ icon _and_ label, never colour alone, per
its own status/priority tables), `SLAIndicator` (on-track/warning-at-75%/
overdue), `EmptyState`, `ErrorState` (message, Retry, and an optional
`traceId` — never a stack trace), `ConfirmationDialog`, and `DataTable` —
a `@tanstack/react-table` wrapper with sorting, pagination and column
visibility. `@tanstack/react-table` is pinned to the 8.x line deliberately:
`npm install`'s "latest" resolves to a 9.0 rewrite with a different,
undocumented-here API (no `useReactTable`/`getCoreRowModel`/`flexRender`),
the same kind of surprise the Prisma 7.10 pin in Phase 3 guarded against.

The shell itself — `Sidebar` (collapsible, `localStorage`-persisted),
`TopBar` (a disabled search input — real search needs Phase 9/10's Posts
module — `NotificationBell`, `UserMenu`), `Breadcrumbs`, `PageHeader` — is
wired into `src/app/(app)/layout.tsx`, a Server Component that resolves
the session via a new `getServerSessionContext()` (the same
`validateSession` Phase 4 built, reached through `next/headers` cookies
instead of a route handler's `NextRequest`), redirects to `/login` when
absent, and computes role-aware navigation server-side via
`loadAuthorizedUser`/`PERMISSIONS` — "administration" is any permission
whose catalogue category is `administration`, not a hardcoded list.
Nav items cross the Server → Client Component boundary as a plain
`{label, href, iconId}` — never the Lucide icon component itself, which
is a function React Server Components can't serialize; the client-side
`NAV_ICONS` map (in `sidebar.tsx`) does the id → icon lookup instead, a
real bug this phase's own tests caught and fixed. The user menu's
"Change Password" (LOCAL users only, per the exit criteria) opens a
dialog wired to Phase 4's existing endpoint; "Sessions" links to a real,
working `/account/sessions` page (list + revoke, over the Phase 4
session APIs) — both already had a working backend with no UI in front
of it. `/notifications`, `/posts`, `/posts/new`, `/approvals`, `/reports`
and `/admin` are honest placeholders (`ComingSoon`, naming the phase that
builds each one for real) rather than dead links, since Posts (8/9/10),
Approvals (11-14), Reports (22) and Administration (21) don't exist yet;
root `/` keeps Phase 2's placeholder rather than redirecting, since there
is no real dashboard yet to send an authenticated visitor to — Phase 7
is the natural point to add that redirect.

Two real bugs surfaced and fixed while building this, beyond the nav-item
serialization one: `test:e2e` didn't load `.env`, so a fresh session's
Playwright process couldn't see `DATABASE_URL`/etc. at all (fixed by
wrapping it in `dotenv -e .env --`, matching `test`/`pretest`), and the
e2e webServer's hardcoded port (3100, chosen so it never collides with a
real `next dev` on 3000) didn't match `.env`'s `APP_URL` (3000), so every
CSRF-protected login in the shell suite failed Origin verification before
this phase ever touched a line of shell code — fixed with a `playwright.config.ts`
env override scoped to that one webServer process.

- **Exit — verified**: `tests/e2e/shell.spec.ts` logs in as each of the
  three seeded demo accounts (spawning `db:seed` once and parsing its
  printed password, exactly like `seed-idempotency.test.ts` already does,
  plus a small `reset-demo-login-attempts` script so repeated local runs
  never trip the real `RATE_LIMIT_AUTH_MAX`) and asserts the exact nav
  item set for EMPLOYEE, APPROVER and ADMIN; an `@axe-core/playwright`
  scan of the authenticated shell reports zero violations; all four
  breakpoints (≥1280, 1024–1279, 768–1023, <768) are exercised, with the
  sidebar persistent at ≥1024 and a working slide-over drawer (hamburger
  → nav reachable) below it — a two-mode simplification of the spec's
  three-mode ideal (persistent / auto-icon-only / drawer) recorded here
  deliberately rather than silently. 9 e2e tests plus 12 new unit tests
  (`StatusBadge`/`PriorityBadge`/`SLAIndicator`/`EmptyState`/`ErrorState`/
  `DataTable`) bring the suite to 119 vitest + 9 Playwright tests, all
  passing repeatably; `lint`, `typecheck`, `format:check` and `build` are
  all still clean.

### Phase 7 · Dashboards

Employee, approver and admin dashboards with real queries and skeleton loading.
**Exit**: each role sees its own dashboard; counts match the database.

### Phase 8 · Post Editor (hero screen A)

Tiptap editor with server-side sanitisation, autosave, draft recovery, unsaved
changes guard, post settings, deterministic readiness checklist, preview,
submit confirmation and the `CHANGES_REQUESTED` banner.
**Exit**: the flow in §4 of `UI_UX_SPEC.md` works exactly as drawn, including
tablet and mobile layouts; hostile HTML in the editor is neutralised; no AI
affordance exists anywhere on the screen.

### Phase 9 · File upload and local storage

`FileStorage` + `LocalFileStorage`, the seven-step upload pipeline, Sharp
re-encoding, ffprobe/ffmpeg handling, thumbnails, authenticated streaming
endpoints, temp sweep.
**Exit**: crafted-file tests (extension/MIME mismatch, polyglot, SVG, `../`
paths, oversize) are all rejected; image and video upload, preview and reorder
work in the editor.

### Phase 10 · Post details and versioning

Version freezing at submission, version list, immutable version view, word-level
diff and attachment delta, post details tabs, activity timeline.
**Exit**: version numbering is gapless per post; an approved post edited anew
produces a version and returns to DRAFT while the old approval still points at
the version it approved.

---

## Milestone 3 — Approval (Phases 11–15)

### Phase 11 · Approval workflow

The state machine, transactional transitions, `ApprovalAction` writes,
optimistic locking, `SELECT … FOR UPDATE`, idempotency keys.
**Exit**: every legal transition passes and every illegal one is refused with
`INVALID_TRANSITION`; a concurrent double-approve test leaves exactly one
approval.

### Phase 12 · Approval assignment

`ApprovalRule` evaluation by `priorityOrder`, target types (user, group,
department manager), creator override where allowed, reassignment, the admin
rule preview.
**Exit**: routing resolves server-side for every seeded rule; the frontend
contains no routing logic at all.

### Phase 13 · Approval Queue

Queue table with due-date sort, quick filters, bulk assign (never bulk approve).
**Exit**: filters and pagination correct; an approver sees only what they may
see.

### Phase 14 · Approval Review (hero screen B)

The full screen from §5 of `UI_UX_SPEC.md`: five-second header, tabs, version
comparison, sticky decision panel, mandatory comments, confirmation restating
the version, concurrency banner, keyboard shortcuts, prev/next navigation,
post-decision result.
**Exit**: an approver decides without leaving the page; a stale version decision
is refused with `ALREADY_DECIDED`; the mobile bottom-sheet decision flow works
and cannot approve accidentally; the word "AI" appears nowhere.

### Phase 15 · Comments and collaboration

Threaded comments bound to versions, server-side mention parsing, mention
autocomplete restricted to visible users, sanitised rendering.
**Exit**: mentions notify the right people; a claimed mention list from the
client is ignored.

---

## Milestone 4 — Delivery (Phases 16–20)

### Phase 16 · Notifications

Notification writes on every workflow event, in-app centre, unread badge,
filters, preferences.
**Exit**: each of the ten notification types fires exactly once per event; the
badge count matches the database.

### Phase 17 · Email

`EmailService`, `SMTPEmailProvider`, template rendering and escaping,
`EmailLog`, retry with backoff, idempotency, admin test-send.
**Exit**: all eight required emails render and queue; SMTP failure retries and
records `lastError`; no credential ever reaches a log.

### Phase 18 · Daily digest

One consolidated digest per approver at the configured hour and timezone, with
the pending list, waiting times, SLA state and direct review links.
**Exit**: a scheduled run produces one email per approver with pending work and
none for approvers without; a repeated tick does not double-send.

### Phase 19 · SLA and escalation

Policy resolution, due/warning computation, indicators across the UI, the
`SLA_CHECK` and `SLA_ESCALATE` jobs, escalation targets.
**Exit**: warning at 75% and overdue at 100% fire once each; **an expired SLA
never changes a post's status** — asserted by an explicit test.

### Phase 20 · Retention

Per-entity policies, dry-run default, `RetentionRun` history, safe transactional
deletion, orphan attachment and temp file cleanup with the "referenced by any
version" guard.
**Exit**: a dry run reports candidates and deletes nothing; a real run deletes
exactly those candidates; an attachment referenced by any version is never
removed.

---

## Milestone 5 — Administration and insight (Phases 21–23)

### Phase 21 · Administration

All fourteen sections from `UI_UX_SPEC.md` §6, including user enable/disable
with session revocation, role assignment, and LOCAL-only password management.
**Exit**: an administrator can run the system without touching the database;
Entra users show no password affordance anywhere.

### Phase 22 · Reporting

The twelve reports, filters, charts with accompanying tables, CSV export with
the formula-injection guard.
**Exit**: numbers reconcile with direct SQL; exports open correctly in Excel and
LibreOffice.

### Phase 23 · Audit logging

Audit writes inside the transactions of every listed action, the read-only admin
viewer with filters and export, append-only enforcement.
**Exit**: every action in §24 of the master specification produces exactly one
row; no code path updates or deletes an audit row; sensitive values are absent
from `metadata`.

---

## Milestone 6 — Production readiness (Phases 24–28)

### Phase 24 · Backup and restore

Scripts, marker endpoint, storage/health visibility, and a documented drill —
`BACKUP_RESTORE.md` verified by actually performing a restore.
**Exit**: a restore onto a clean host passes the post-restore checklist.

### Phase 25 · Security hardening

Headers and CSP with nonces, rate limiting, secret-leak review, dependency
audit, container hardening (non-root, pinned digests, read-only root),
`npm run security-review` against the threat table in `SECURITY.md`.
**Exit**: every row of that table has a passing test or a recorded justification.

### Phase 26 · Testing

Complete the unit, integration and E2E suites — the 21-step business journey and
the explicit negative-authorization cases from §37 of the master specification,
plus axe checks on the shell, both hero screens and the tables.
**Exit**: full suite green in CI from a clean database; coverage meaningful on
the state machine, authorization, SLA and retention modules.

### Phase 27 · Production deployment

`Dockerfile` (multi-stage, non-root), `docker-compose.yml` (app, worker,
postgres, nginx), Nginx config, health checks, Podman verification, systemd
units, migration entrypoint with advisory lock.
**Exit**: a clean-host install following `DEPLOYMENT.md` verbatim reaches a
working system, on both Docker and Podman.

### Phase 28 · Final UX polish

Empty and error states everywhere, loading skeletons, keyboard shortcuts,
copy pass, accessibility sweep, performance check on the two hero screens.
**Exit**: the acceptance criteria in §45 of the master specification are all met.

---

## Cross-cutting checks at every milestone

| Check                   | How                                                        |
| ----------------------- | ---------------------------------------------------------- |
| Migrations from scratch | drop database, `db:deploy`, `db:seed`                      |
| Authorization           | negative tests for each new endpoint                       |
| Responsive              | 1440 / 1280 / 900 / 390 px                                 |
| Accessibility           | axe on new screens, keyboard-only pass                     |
| No AI, no cloud         | grep the diff for provider names and CDN URLs              |
| Console/server errors   | clean on every touched screen                              |
| Documentation           | update the relevant `.md` in the same commit as the change |

---

## Risk register

| Risk                                                    | Mitigation                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAML integration cannot be tested without a real tenant | Build against recorded fixtures and a stub IdP with a test certificate from Phase 4; schedule a tenant test as soon as the customer provides one    |
| Video processing cost and image size on a modest VM     | Cap size and count by configuration; process in the worker, never in the request path; document sizing                                              |
| Version diff quality on rich text                       | Diff on extracted plain text plus a structural attachment/metadata delta; a full structural rich-text diff is a later enhancement, recorded as such |
| Retention deleting something wanted                     | Dry-run by default, run history, per-entity policies, backup-first guidance                                                                         |
| Scope creep toward publishing or AI                     | Both are explicitly out of scope; any such request is a specification change, not a task                                                            |
| Air-gapped npm install during the build                 | Build images where registry access exists and transfer them (`docker save`/`load`), per `DEPLOYMENT.md`                                             |

---

## Definition of done for the product

The acceptance list in §45 of the master specification, verbatim, plus:
migrations apply cleanly from empty, the full test suite passes in CI, a
clean-host install from `DEPLOYMENT.md` works on Docker and Podman, and a
restore drill from `BACKUP_RESTORE.md` succeeds.
