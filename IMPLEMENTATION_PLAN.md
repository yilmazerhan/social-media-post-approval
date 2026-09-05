# IMPLEMENTATION_PLAN.md

The build order, what "done" means at each step, and where we currently are.
The 28 phases from the master specification are grouped into seven milestones so
progress is reviewable in meaningful chunks rather than one uncontrolled change.

**Current status: Phase 13 complete — proceeding directly to Phase 14 per the user's standing instruction to work through all remaining phases.**

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

### Phase 7 · Dashboards — **complete**

Delivered the three role-aware dashboards `UI_UX_SPEC.md` §6 specifies,
chosen the same way the shell already picks nav items — by granted
permission, never a raw role name — in `src/app/(app)/dashboard/page.tsx`:
any administration-category permission gets the admin view, `APPROVAL_READ`
gets the approver view, everyone else gets the employee view.

The read-only aggregate queries live in the module each one is really
about, not a new `dashboard` module — `ARCHITECTURE.md`'s module list
doesn't have one, and its §3 is explicit that "Server Components read
through the same module services (not raw Prisma)". `posts` gained
`getEmployeeDashboard` (per-status counts, `hasAnyPosts` for the empty
state, and a recent-activity feed over `ApprovalAction`) and
`getContentVolumeSeries` (versions-submitted-per-day, bucketed in JS);
`approvals` gained `getApproverDashboard` (pending/due-soon/overdue/
recently-completed, scoped to the caller's own assignments or their
group's, plus an SLA-compliance rate) and `getSystemApprovalStats`
(the same shape system-wide, plus average approval time); `users` gained
`getUserStats`. "Due soon" and "overdue" read the assignment's own
`warningAt`/`dueAt` columns rather than an ad-hoc threshold — the SLA
module (Phase 11/12) owns computing those, Phase 7 just reads them.
Admin's four health tiles (database/storage/worker/email) are a new
`src/server/health.ts` instead — infrastructure-layer liveness pings, not
a domain module, and explicitly not the production `/api/health`
container check (Phase 27): a `SELECT 1`, an `fs.access` on
`STORAGE_PATH`, and `BackgroundJob`/`EmailLog` failure counts.

New design-system pieces: `Card` and `Skeleton` (shadcn primitives Phase 6
didn't need yet), and app-level `StatCard`, `HealthTile`,
`ContentVolumeSparkline`, and `ActivityItem` — the last exports an
`ACTION_LABELS` map for `ApprovalActionType` that Phase 10's post-details
activity timeline will reuse rather than re-deriving the same wording.
The sparkline is deliberately a plain div bar-chart with a text summary,
not a charting library — that choice, and the "a chart always comes with
a data table" rule, belong to the Reports phase (14/15), which renders
this same kind of series at full detail. A `/posts/[id]` `ComingSoon`
placeholder was added so the activity feed's links to a specific post
resolve to something honest instead of a 404 (Phase 10 builds the real
page). `/` now redirects a signed-in visitor straight to `/dashboard` —
the redirect Phase 6's retrospective flagged as its natural next step —
while an anonymous visitor still sees Phase 2's placeholder. `loading.tsx`
(a skeleton matching the stat-card grid) and `error.tsx` route boundaries
cover the dashboard segment per `UI_UX_SPEC.md` §7.

Two real bugs surfaced during this phase, both fixed before landing: a
`dueSoon` query built its `where` by spreading the "assigned to me" filter
(itself an `OR`) and then adding a second top-level `OR` for the due-date
condition — the second silently overwrote the first, so the query would
have quietly ignored the assignee filter entirely; caught in review and
rewritten as an explicit `AND` of both conditions. Second, adding
`dashboard.spec.ts` alongside the existing `shell.spec.ts` reintroduced
(worse) the exact password race Phase 6 already solved once with
`mode: "serial"` — that only serializes within one file, and two files
each independently reseeding in their own `beforeAll` raced across
Playwright's worker pool. Fixed properly this time with a Playwright
`globalSetup` (`tests/e2e/support/global-setup.ts`) that seeds and resets
login attempts exactly once for the whole run, and a shared
`support/demo-accounts.ts` helper both spec files import instead of each
keeping its own copy. That fix then exposed a second, real one: the two
files' combined login count (11) exceeded `RATE_LIMIT_AUTH_MAX`
(10/15 min) — which counts by IP as well as by email, and every e2e login
comes from the same loopback address — so the suite started tripping its
own rate limit. Fixed the same way the CSRF port mismatch was fixed in
Phase 6: an env override scoped to the e2e `webServer` process only, with
the production default (the real control against credential stuffing)
untouched.

Testing approach for the two flavors of query this phase added: functions
scoped to a specific user or approver (`getEmployeeDashboard`,
`getApproverDashboard`) are asserted with exact expected counts, since
nothing else in the database can affect them. System-wide aggregates
(`getSystemApprovalStats`, `getUserStats`, `getContentVolumeSeries`) are
asserted as a _delta_ across a known set of fixture rows instead, because
`tests/integration/seed-idempotency.test.ts` seeds real rows into the same
test database and file execution order isn't guaranteed —
`getSystemApprovalStats`'s average-approval-time arithmetic is additionally
cross-checked against an independently written query over whatever the
database holds at that moment, rather than a fixed expected number.

- **Exit — verified**: `tests/e2e/dashboard.spec.ts` logs in as each seeded
  demo account and checks its dashboard against the real seed data —
  John's one card reading "1" pending approval, Jane's due-soon/overdue/
  recently-completed counts and "No decisions with a due date" SLA copy,
  and Admin's "3"/"3" user counts, "3 posts submitted in the last 14 days",
  "3h 0m" average approval time, and all four health tiles reporting
  Healthy — literally the "counts match the database" exit criterion, not
  just a shape check. 8 new component unit tests plus 9 new integration
  tests (against real Postgres, fixtures created and torn down per test)
  bring the suite to 136 vitest + 12 Playwright tests, all green
  repeatably; `lint`, `typecheck`, `format:check` and `build` are clean.

### Phase 8 · Post Editor (hero screen A) — **complete**

Delivered the CREATE → autosave → VALIDATE → PREVIEW → SUBMIT flow
`UI_UX_SPEC.md` §4 draws, backed by a new `posts` module
(`content-schema.ts`, `content-render.ts`, `reference.ts`, `service.ts`,
`submit.ts`) and a first real slice of `approvals`
(`route-resolution.ts`, `state-machine.ts`). `/posts/new` is a Server
Component that creates a draft (title is optional at this point — the
spec's own CREATE-before-VALIDATE ordering) and redirects to
`/posts/[id]/edit`, which mounts `editor-screen.tsx`: Tiptap
(`rich-text-editor.tsx` + `toolbar.tsx`) wired to `use-autosave.ts` (3s
idle debounce, `AUTOSAVE_INTERVAL_SECONDS`), `use-draft-recovery.ts`, and
`use-unsaved-changes-guard.ts`, alongside `post-settings-panel.tsx`,
`readiness-checklist.tsx`, `preview-dialog.tsx`,
`submit-confirmation-dialog.tsx`, and `changes-requested-banner.tsx`.

Sanitisation follows `ARCHITECTURE.md` ADR-007 (Tiptap JSON is the source
of truth; HTML is a derived, never-trusted artifact) more strictly than
the obvious approach: instead of running untrusted HTML through a
third-party sanitiser, `content-schema.ts` validates the editor's JSON
against a closed, hand-written Zod vocabulary (paragraph/blockquote/
bulleted and ordered lists, bold/italic/underline/strike marks, a link
mark whose `href` must match `^https?://` or `^mailto:`), and
`content-render.ts` only ever _constructs_ HTML from that validated
structure — there is no code path that parses or cleans an HTML string
from the client, so there is nothing for a sanitiser bypass to bypass.
Submission freezes both the JSON and the rendered HTML onto an immutable
`PostVersion` row (ADR-006); `title`/`departmentId`/`priority` stay on
the mutable `Post`.

Two architectural questions came up that the spec doesn't gate behind a
later phase, so this phase answers them for real rather than stubbing
them: `DATABASE.md` §5 says routing is "computed server-side at
submission — never in the frontend" and that a seeded catch-all rule
"guarantees a route always resolves", and `ARCHITECTURE.md`/`CLAUDE.md`
both say every workflow transition goes through one state-machine table
with no second path. So `route-resolution.ts` and `state-machine.ts` are
real now: `resolveApprovalRoute` matches seeded rules by priority order,
department, post priority and creator group, resolves the assignee
(including `DEPARTMENT_MANAGER` → `Department.managerId`), and is the one
function both the live readiness checklist and actual submission call;
`state-machine.ts`'s `TRANSITIONS` table is the single source
`assertLegalTransition` checks, with only `SUBMIT`/`RESUBMIT` executed
this phase (Phase 11 adds the approver-facing transitions). `submit.ts`
runs the whole thing — row lock, `lockVersion` check, transition
assertion, a final server-side readiness re-check, route resolution,
version freeze, assignment creation, audit write — inside one
`prisma.$transaction`. `dueAt`/`warningAt` and email notification are
deliberately left for Phase 19; the assignment is created `PENDING` with
no deadline yet.

Auditing the ownership policy while wiring `POST_SUBMIT` into
`protectedHandler` found a real gap: `OWNED_POST_PERMISSIONS`
(`src/modules/authorization/service.ts`) only listed
`POST_READ_OWN`/`POST_EDIT_OWN`, so `POST_SUBMIT`, `POST_DELETE_OWN` and
`POST_CANCEL` weren't scoped to the owning user at all — any authenticated
employee could have submitted, deleted or cancelled someone else's draft.
Fixed by adding all three to the set (cross-user access still correctly
returns 403, matching the existing owned-post policy's deliberate
403-not-404 design) and extending `authorization.test.ts`'s scoped-policy
assertions to cover them.

Two more real bugs surfaced during verification, both fixed before
landing. First, a genuine DoS: `content-schema.ts`'s recursive block-node
schema originally used a plain `z.union`, which retries every branch on
failure — an adversarial 40-level-deep nested payload drove one process
to 8.5GB RSS and 200%+ CPU before it was killed. Zod unions inside a
recursive `z.lazy()` schema multiply cost across depth; a
`z.discriminatedUnion("type", [...])` only tries the one matching branch,
so the same fixture now validates in single-digit milliseconds regardless
of depth. `MAX_NESTING_DEPTH = 32` is kept as a second, independent
bound. Second, a build-time crash: `npm run build` logged repeated
`Cannot find module 'thread-stream/lib/worker.js'` errors during static
generation — Phase 8 is the first phase where a route handler imports
`@/server/logger` at build-analysis time, and pino's `transport` option
spawns a worker thread that Next.js/Turbopack's build sandbox can't
resolve. Fixed by switching `server/logger.ts` from the `transport`
option to pino-pretty's synchronous destination-stream form
(`pino(options, pinoPretty(...))`), which needs no worker thread; the
build is now clean under both `LOG_FORMAT=pretty` and `=json`.

Testing this phase's flows against a single shared, persistent Postgres
database (rather than a disposable schema) surfaced a second class of
issue beyond Phase 7's password race: `tests/integration/dashboard.test.ts`
began failing intermittently once new integration test files created
users concurrently, because Vitest's default file-level parallelism has
every file racing against the same rows. Fixed with `fileParallelism:
false` in `vitest.config.mts`. The e2e equivalent was worse:
`editor.spec.ts` submits a real post against the real dev database, which
both permanently changes the counts `dashboard.spec.ts` pins to the
seeded fixture and, under Playwright's default multi-worker pool, raced
badly enough with concurrent submissions to blow past request timeouts.
Fixed two ways together: `tests/e2e/support/db-cleanup.ts` (backed by a
new `prisma/delete-post-by-title.ts` script) deletes every post the suite
creates in `afterEach` by its distinctive title, and `playwright.config.ts`
now sets `fullyParallel: false`/`workers: 1` to remove the cross-spec
contention outright rather than chase individual races — both changes are
documented inline as a deliberate consequence of sharing one real database
across specs. A related, longer-lived issue: the seeded hero post's
`dueAt`/`warningAt` were computed once relative to whenever `db:seed`
first ran, so "due in 6h" silently drifted into "overdue" purely from
wall-clock time elapsing across a long-lived dev session — this broke
`dashboard.spec.ts`'s "Due soon" assertion with no code change involved.
Fixed by having `seedHeroPost` refresh the open assignment's
`dueAt`/`warningAt` and the post's own mirrored `dueAt` on every seed run
(not just the first), explicitly leaving the frozen `PostVersion` alone
per ADR-006.

- **Exit — verified**: `tests/e2e/editor.spec.ts` drives the full
  CREATE → type → autosave → (blocked: no department) → pick department →
  preview → submit flow in a real browser against the seeded "Marketing
  content" rule, asserting the resolved approver ("Jane Manager") never
  leaks the rule's internal name and that the confirmation shows
  "Version 1"/"Assigned to Jane Manager"; a second test asserts zero
  axe violations on the editor; a third drives the same create flow at a
  375px viewport and asserts the sticky action bar and the mobile
  readiness summary's expand/collapse both work. Hostile-HTML coverage
  lives in `tests/unit/content-schema.test.ts` (script tags, `javascript:`
  links, oversized/deeply-nested documents all rejected) and
  `content-render.test.ts` (every mark and node renders only its
  whitelisted tag, nothing else reaches the DOM). 36 new vitest tests
  (13 posts-editor + 3 posts-routes integration, plus schema/render/
  component unit tests) and 3 new Playwright specs bring the suite to 172
  vitest + 15 Playwright tests, all green repeatably; `lint`, `typecheck`,
  `format:check` and `build` are clean, with no AI-related affordance,
  label, table, or endpoint anywhere in the phase.

### Phase 9 · File upload and local storage — **complete**

Delivered the whole upload surface behind a new `attachments` module:
`FileStorage`/`LocalFileStorage` (`file-storage.ts`, keys opaque and
path-escape-checked per ARCHITECTURE.md §6), the seven-step pipeline
split across `upload-stream.ts` (step 1 — `busboy` streams the multipart
body to a temp file with `MAX_UPLOAD_SIZE` enforced while bytes are still
arriving, not after the fact), `validation.ts` (step 2 — extension/MIME
allowlists; SVG needs no special case since `image/svg+xml` was never on
the allowlist to begin with) and `media.ts` (steps 3-6 — `file-type`'s
magic-byte sniff, Sharp re-encode + `THUMBNAIL_WIDTH` thumbnail for
images, `ffprobe`/`ffmpeg` for video duration/codec/dimensions and a
poster frame). `pipeline.ts` orchestrates and persists the `Attachment`
row; `service.ts` adds read-policy authorization (uploader while
`TEMPORARY`, the owning post's read policy once `ATTACHED`), deletion,
and `attachToVersion` — the piece `posts/submit.ts` calls to bind the
draft's ordered attachment list onto the just-frozen `PostVersion`.

The one real design gap the spec left open (flagged by research before
writing code, confirmed against every doc): `Attachment` has no FK to a
draft, only to whichever `PostVersion` eventually references it, so
nothing in the schema said how the editor's in-progress media list
survives a reload before submission. Filled it the same way
`draftTitle`/`draftContentJson` already work — a new `Post.draftAttachmentIds`
column (migration `20260905184251_post_draft_attachment_ids`), an
ordered array of attachment ids, read and written by the same
`updateDraft`/`getPostForEdit` path as the rest of the draft. `PATCH
/posts/:id` gained `attachmentIds`, validated for ownership before
saving; the readiness checklist's "Attachments valid" item (a stub since
Phase 8) is now real.

Phase 9 was also the first phase to need a working background-job
_runner_, not just the queue's schema — `src/jobs/queue.ts` implements
the generic claim/run mechanics ARCHITECTURE.md §7 describes (`SELECT …
FOR UPDATE SKIP LOCKED`, `PENDING → RUNNING → SUCCEEDED | PENDING (backoff)
| DEAD`, stale-lock reclaim), with a handler registry any module can add
to; `attachments/jobs.ts` registers `TEMP_FILE_CLEANUP` and
`ORPHAN_ATTACHMENT_CLEANUP` as its first two consumers, and
`worker.ts` now actually polls instead of just proving the process stays
up. Later phases (16-20) reuse the same registry for their own job types.

Two real bugs surfaced during verification, both fixed before landing.
First, a genuine race in `upload-stream.ts`: busboy's own `"finish"`
event (parsing done) can fire before the per-file write stream's
_separate_ `"finish"` event (flushed to disk) — without a `sawFile` flag,
the first `"finish"` always won and rejected every upload, valid or not,
as "no file field found". Caught by the integration suite, not by hand
because a synthetic in-memory `Request` in isolation didn't always
expose the race — real disk I/O timing did. Second, the same class of
bug Phase 8 hit with `pino-pretty`: `sharp`, `file-type` and `busboy` all
do runtime module resolution a bundler can't statically analyze, and
Turbopack failed real (non-test) uploads with "Cannot find module as
expression is too dynamic" — invisible to `vitest` (which doesn't bundle
through Turbopack) and only caught by actually driving the upload through
a real dev server in Playwright. Fixed with `serverExternalPackages` in
`next.config.ts`, Next's documented escape hatch for exactly this.

Verifying the e2e flow also exposed a real, pre-existing race in Phase
8's own `handleSubmit`: `router.refresh()` right after a successful
submit re-runs `posts/[id]/edit/page.tsx` server-side with the post's
now-changed `capabilities.canEdit`, and the page's `if (!canEdit) return
<ErrorState/>` swapped `EditorScreen` out from under its own
just-rendered `SubmissionConfirmation` — a structural change React has no
choice but to unmount. It plausibly always raced; Phase 9's slightly
larger client bundle just tipped it from "usually wins" to "reliably
loses". Fixed by moving the gate into `EditorScreen` itself as a
`useState` frozen at mount, so a later prop refresh can't retroactively
hide a view already on screen — the parent page now always renders
`EditorScreen` once a post is found.

- **Exit — verified**: `tests/integration/attachments-pipeline.test.ts`
  runs the real pipeline against real files — valid JPEG/PNG/MP4 are
  accepted (re-encoded, thumbnailed/probed/postered); SVG, an
  extension/MIME mismatch, a magic-byte mismatch, a truncated-but-valid-header
  MP4 (the polyglot case), a disallowed type, and an oversize image (a
  genuine >10MB file, not a synthetic byte count) are all rejected with
  the right `FILE_TYPE_REJECTED`/`FILE_TOO_LARGE` code. `../` traversal
  is covered in `file-storage.test.ts`'s `resolveStorageKey` unit tests.
  `attachments-routes.test.ts` drives the real HTTP endpoints: upload,
  uploader-vs-stranger read authorization while `TEMPORARY` and again
  once `ATTACHED`, delete (and the 409 once attached), and a full
  create → upload → patch → submit flow asserting the `PostVersionAttachment`
  row and `ATTACHED` status. `tests/e2e/editor.spec.ts` adds a real
  browser upload (drag-and-drop's keyboard-reachable file-input fallback,
  per the accessibility requirement) through to a visible thumbnail,
  remove, and the readiness count updating live. 40 new vitest tests and
  1 new Playwright spec bring the suite to 212 vitest + 16 Playwright
  tests, all green repeatably; `lint`, `typecheck`, `format:check` and
  `build` are clean.

### Phase 10 · Post details and versioning — **complete**

Built the read side of versioning — `posts/versions.ts` (`getPostDetail`,
`listVersions`, `getVersion`, `compareVersions`, `getActivity`) and the
real Post Details screen at `/posts/:id`, replacing Phase 7's
placeholder: Overview, Preview, Versions, Approval history, Comments and
Activity tabs (`UI_UX_SPEC.md` §6), a new `Tabs` primitive
(`@radix-ui/react-tabs`), and `VersionDiff` — a shared word-level-diff
renderer (`diff`'s `diffWords`, wrapped in `src/lib/diff.ts` as the pure,
unit-tested `computeWordDiff`) rendering additions green-underlined and
removals red-struck-through with a legend, plus an attachment
added/removed/reordered delta with thumbnails, exactly as §5 describes
for Approval Review's Compare tab — Phase 14 reuses this component
rather than rebuilding it. The Comments tab renders a real (currently
always-empty) query against the `Comment` table rather than a stub,
since creating comments is genuinely Phase 15's work; nothing here is
half-built.

The one true gap in the spec, resolved by research against every doc
before writing code: no endpoint or table says _how_ editing an
`APPROVED` post moves it back to `DRAFT`, since that transition isn't one
of `ApprovalActionType`'s nine values (state-machine.ts's own comment
flagged this back in Phase 8). ARCHITECTURE.md §4 and ADR-006 together
resolve it — "an approved post that is edited returns to DRAFT with a new
version pending" — so `posts/service.ts` gained `reopenIfApproved`, called
at the top of both `updateDraft` and `autosaveDraft`: the first draft
mutation reaching an `APPROVED` post flips its status to `DRAFT`, clears
`approvedVersionId`, and writes a `POST_REOPENED_FOR_EDIT` audit entry —
a plain status update outside `assertLegalTransition`'s table, exactly as
that comment demanded. Nothing else changes: `draftContentJson` already
equals the approved version's content (submission never clears it), so
the draft needs no re-seeding, and the _actual_ new version is frozen by
the ordinary DRAFT → SUBMITTED path `submit.ts` already had — no second
version-freezing mechanism, per ADR-006's "only submission freezes a
version." `EDITABLE_STATUSES` (service.ts and both the PATCH/autosave
route handlers) gained `APPROVED`; `REJECTED` deliberately did not, since
`UI_UX_SPEC.md`'s My Posts row-action table gives a rejected post only
View/Duplicate, never Edit — reopening only ever applies to an approval
that's since proven wrong, not a rejection, which the spec routes through
Duplicate instead (Duplicate itself isn't built this phase — it's in
API.md's table but not in Phase 10's own exit criteria, and is noted here
as a real, deliberate gap rather than silently dropped).

- **Exit — verified**: `tests/integration/post-versions.test.ts` submits,
  simulates a Phase-11-not-yet-built `REQUEST_CHANGES` (completing the
  open assignment, since only one `PENDING`/`IN_PROGRESS` assignment is
  ever allowed per post) and resubmits, asserting `versionNumber` 1 then
  2 with `supersedesVersionId` chained correctly — gapless numbering
  under the real path, not asserted in isolation. A second test approves
  a post (simulating Phase 11's not-yet-built `APPROVE`), edits it, and
  asserts the status flip to `DRAFT`, `approvedVersionId` cleared, the
  `POST_REOPENED_FOR_EDIT` audit row, and — the exit criterion's exact
  wording — that the historical `ApprovalAction` row is untouched and
  still names the version it approved; resubmitting then produces a
  correctly-chained version 2. `tests/e2e/post-details.spec.ts` drives
  the real screen against the seeded hero fixture (three versions, a
  `REQUEST_CHANGES` comment on version 2): Overview's version numbers,
  the Versions tab's default previous→current comparison rendering the
  diff and legend, Approval history showing the request-changes comment,
  Activity showing the submission — plus a dedicated axe pass, zero
  violations. 9 new vitest tests and 2 new Playwright specs bring the
  suite to 219 vitest + 18 Playwright tests, all green repeatably;
  `lint`, `typecheck`, `format:check` and `build` are clean.

---

## Milestone 3 — Approval (Phases 11–15)

### Phase 11 · Approval workflow — **complete**

Built the four decision transitions on top of the transition table
state-machine.ts already carried — `approvals/decisions.ts`'s `startReview`,
`approvePost`, `requestChanges`, `rejectPost` — following exactly
`submit.ts`'s transactional shape: `SELECT … FOR UPDATE` on the post row,
re-check `lockVersion` (else `409 STALE_RESOURCE`), re-check that the
decision's `postVersionId` still matches `currentVersionId` (else
`409 ALREADY_DECIDED` — API.md §2's own wording), run
`assertLegalTransition`, complete the open `ApprovalAssignment`, write the
`ApprovalAction`, `writeAudit`. `start-review` is the one API.md documents
as idempotent ("`SUBMITTED → IN_REVIEW`; idempotent"): a repeat call while
the post is already `IN_REVIEW` under its own still-`IN_PROGRESS`
assignment returns the existing result rather than throwing
`INVALID_TRANSITION`. `POST_CANCEL` (`posts/cancel.ts`, since API.md places
`/:id/cancel` under `/api/v1/posts`, not `/api/v1/approvals`) is legal only
from `DRAFT` or `SUBMITTED` per state-machine.ts's own `CANCEL` rows, and
also completes any open assignment; a never-submitted `DRAFT` has no
`PostVersion` yet, so unlike every other decision here it writes no
`ApprovalAction` row (there's nothing for that row's mandatory
`postVersionId` to name) — only the audit entry.

Two real gaps, both resolved by reading rather than guessing.
`COMMENT_REQUIRED` (API.md §3's own example: `request-changes` without a
comment) needed a distinct error path from generic `VALIDATION_FAILED`
since it names a `field` (`comment` for request-changes, `reason` for
reject — DATABASE.md §5's `CHECK` constraint enforces both as one
underlying `ApprovalAction.comment` column) the way `NotReadyError`/`FileRejectedError`
already do for their own codes; `handler.ts` gained a matching
`CommentRequiredError`, and `comment`/`reason` stay optional at the Zod
layer precisely so a blank one reaches this check instead of the wrong
code. Second: API.md's cancel row says "creator or admin," but
`checkOwnedPost` (Phase 5) only ever checks `creatorId === user.id` — true
for every other owned-post permission, wrong here. Rather than bend the
shared policy every other permission relies on, `POST_CANCEL` got its own
`checkCancelPost` in `authorization/policies.ts`, reusing `POST_READ_ALL`
as the admin-reach signal exactly the way `checkApprovalRead` already
does, so the one permission that needed different behaviour got it
without changing the other four. What's still a documented, deferred gap:
API.md's general `Idempotency-Key` header (response caching for a repeat
request with the same key) has no backing table anywhere in DATABASE.md —
only `start-review`'s specific, narrower idempotency (its own documented
behaviour) is built; a full idempotency-key store isn't this phase's exit
criterion and isn't invented here. `assign`/`reassign` and the queue/review
screens are Phase 12–14, not this one.

- **Exit — verified**: `tests/integration/approvals-decisions.test.ts`
  drives every legal transition (`SUBMITTED → IN_REVIEW → APPROVED`,
  `→ CHANGES_REQUESTED`, `→ REJECTED`, `DRAFT/SUBMITTED → CANCELLED`) and
  every illegal one named in this phase's exit criterion: approving before
  `start-review`, a stale `postVersionId` (`ALREADY_DECIDED`), a stale
  `lockVersion` (`STALE_RESOURCE`), a missing mandatory comment/reason
  (`COMMENT_REQUIRED`), cancelling an `IN_REVIEW` post. The named exit
  criterion itself — two concurrent `approvePost` calls racing the same
  post via `Promise.allSettled`, relying on the transaction's row lock to
  serialize them — leaves exactly one `ApprovalAction` row and the post
  `APPROVED`; the loser gets a 409. 14 new vitest tests bring the suite to
  233 vitest + 18 Playwright tests, all green repeatably; `lint`,
  `typecheck`, `format:check` and `build` are clean. No new Playwright spec
  this phase — there is no new screen yet to drive; Phase 14 exercises
  these endpoints through the real Approval Review UI.

### Phase 12 · Approval assignment — **complete**

`ApprovalRule` evaluation by `priorityOrder` and all three target types
(user, group, department manager) was already built in Phase 8's
`route-resolution.ts`, along with creator override — the matching query
this phase and submission both need, per that file's own comment
("`allowCreatorOverride` is the only thing that lets a creator's own
choice replace the rule's own target"). This phase adds the two pieces
that comment named as still missing: manual reassignment
(`approvals/assignment.ts`'s `reassignApproval`, wired to
`POST /api/v1/approvals/:postId/assign`) and the admin dry-run preview
(`route-resolution.ts`'s new `previewApprovalRoute`, wired to
`POST /api/v1/admin/approval-rules/preview`) — UI_UX_SPEC.md §6's "Approval
rules include a 'test this rule' preview that shows which route a
hypothetical post would take," run against a synthetic post rather than a
real one, through the exact same `resolveApprovalRoute` submission uses.

Reassignment never checks who the post belongs to: `APPROVAL_ASSIGN` is
grant-only in the permission catalogue (AUTHENTICATION.md §5), not
resource-scoped like `POST_APPROVE`/`POST_REJECT`, so anyone holding it may
redirect any post's open assignment — matching how `can()` already treats
every grant-only permission. It also never touches `Post.status` or
`lockVersion`, since only the `ApprovalAssignment` row and the historical
`ApprovalAction` change; that's also why it isn't run through
`assertLegalTransition` even though `ASSIGN`/`REASSIGN` are two of
`ApprovalActionType`'s nine values — nothing about `PostStatus` transitions
here, so there's no `(from, action, to)` row for either in
state-machine.ts's table. Which of the two values gets written is decided
by whether an earlier `ASSIGN`/`REASSIGN` action already exists against
that same assignment row: the first manual redirect of an auto-routed
assignment is `ASSIGN`, everything after is `REASSIGN` — a real distinction
the schema draws (both are separate enum values) that submission's
automatic routing never itself writes an `ApprovalAction` for, so the
first manual touch is always the first row.

No admin CRUD screen for approval rules yet — full create/edit/delete
lives with the other thirteen sections of UI_UX_SPEC.md §6 in Phase 21
("Administration"); this phase only had to prove the preview's own
routing logic, which is why the preview endpoint sits under
`/api/v1/admin/approval-rules/preview` even though nothing else in
`/admin` exists yet. It's gated on `SETTINGS_MANAGE` — the permission
catalogue has no dedicated "manage approval rules" key, and `SETTINGS_MANAGE`
("Change system settings") is the closest existing ADMIN-only grant to
"configure routing," so it's reused rather than inventing a new one.

- **Exit — verified**: `tests/integration/approval-assignment.test.ts`
  proves `resolveApprovalRoute` honors the creator's requested approver
  when `allowCreatorOverride` is true and ignores it when false (two rules
  differing only in that flag), `previewApprovalRoute` returns the
  matching rule and assignee name for a hypothetical post and a
  well-formed `null` shape when none matches, and `reassignApproval`
  writes `ASSIGN` on the first manual redirect of a submitted post's
  assignment and `REASSIGN` on the next, resolves both a user's
  `displayName` and a group's `name` correctly, clears the other assignee
  column on a user→group switch, and refuses a post with no open
  assignment. 7 new vitest tests bring the suite to 240 vitest + 18
  Playwright tests, all green repeatably; `lint`, `typecheck`,
  `format:check` and `build` are clean. No new Playwright spec or UI this
  phase — reassignment's own screen ("bulk assign, never bulk approve") is
  Phase 13's Approval Queue, and the preview's admin screen is Phase 21.

### Phase 13 · Approval Queue — **complete**

Built `approvals/queue.ts`'s `getApprovalQueue` and the real `/approvals`
screen, replacing Phase 7's placeholder. "My queue" is deliberately
personal — scoped to assignments routed to the caller directly or via
their groups (`assignedToMeFilter`, now shared with the dashboard
aggregates that already used it), never widened by `POST_READ_ALL`: that
permission governs reading one post's full detail, not "my queue," which
is "my" by definition. The four UI_UX_SPEC.md §6 quick filters (Overdue /
Due today / Unassigned / My group) all map onto real, already-existing
columns rather than invented state: `dueAt` for the first two,
`assigneeUserId IS NULL` for a group assignment nobody has personally
picked up yet ("Unassigned"), and `assigneeGroupId` narrowed to the
caller's own groups for "My group" (a subset of "my queue," which
otherwise mixes direct and group assignments). `dueAt`/`warningAt` are
always `null` until Phase 19 computes them, so `overdue`/`dueToday` are
real, correct queries against columns nothing populates yet — not faked
data, just usually-empty until then.

A real bug surfaced and got fixed here, not routed around: `APPROVAL_READ`
is dual-purpose in `authorization/service.ts` — grant-only for "my queue,"
resource-scoped via `checkApprovalRead` for reading one post
(`GET /:postId`) — and `can()`'s dispatch always takes the resource-scoped
path for that key regardless of context. Passing `permission:
"APPROVAL_READ"` to `protectedHandler` with no `loadResource` therefore
403'd every real request (`checkApprovalRead` sees `resource: undefined`
and returns `false`) — caught only once the queue was driven through a
real browser, the same way Phase 9's Turbopack bug was. Rather than bend
`checkApprovalRead`'s resource-scoped contract (right for `GET /:postId`,
wrong for a query that's already self-scoping), the queue route checks
`authz.permissions.has("APPROVAL_READ")` directly instead of going
through `assert()`.

Bulk assign reuses Phase 12's existing `/:postId/assign` endpoint per
selected row — API.md's own endpoint table has no separate bulk-assign
route, so the queue's "Assign N selected" action is a client-side loop,
not a new backend endpoint. Its target picker is a raw user/group ID
field, not a real people-picker — there's no user-search endpoint yet
(that's Phase 21's `GET /users/mentionable`-adjacent territory), and
building one now would pull Phase 21's work forward; recorded here as a
deliberate, narrow gap rather than a silently half-built feature. `DataTable`
(Phase 6) gets its first real usage: still client-side paginated per its
own doc comment ("a future screen... can switch to manual/server-side
pagination"), so the screen requests up to 100 matching rows and lets it
paginate in-browser, while `getApprovalQueue`'s own `page`/`pageSize`/`total`
are real and independently tested. Also noticed, not fixed (out of this
phase's scope): "My Posts" (`/posts`) is still Phase 7's `ComingSoon`
placeholder despite its own copy claiming Phase 9/10 — a pre-existing gap
from an earlier phase, not one this phase's exit criterion touches.

- **Exit — verified**: `tests/integration/approval-queue.test.ts` proves
  visibility scoping (a user sees only their own direct/group assignments,
  never another user's), every filter (priority, department, overdue, due
  today, unassigned) against real data, and pagination correctness across
  two pages with no overlap or gap. `tests/e2e/approval-queue.spec.ts`
  drives the real screen against the seeded hero fixture (Jane Manager's
  open review): the queue row renders, a non-matching priority filter
  empties it and Clear filters restores it, an employee without
  `APPROVAL_READ` is redirected away from `/approvals` entirely, and a
  dedicated axe pass finds zero violations. 5 new vitest tests and 1 new
  Playwright spec (3 tests) bring the suite to 245 vitest + 21 Playwright
  tests, all green repeatably; `lint`, `typecheck`, `format:check` and
  `build` are clean.

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
