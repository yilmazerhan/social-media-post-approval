# IMPLEMENTATION_PLAN.md

The build order, what "done" means at each step, and where we currently are.
The 28 phases from the master specification are grouped into seven milestones so
progress is reviewable in meaningful chunks rather than one uncontrolled change.

**Current status: planning complete — awaiting the go-ahead to start Phase 2.**

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

### Phase 2 · Project skeleton and development environment
- Next.js 15 App Router + React 19 + TypeScript 5 strict; `npm`, lockfile
  committed.
- Tailwind, shadcn/ui init, Lucide, the token layer from `UI_UX_SPEC.md`,
  self-hosted Inter.
- ESLint + Prettier + `tsc --noEmit`, npm scripts (`dev`, `build`, `start`,
  `worker`, `lint`, `typecheck`, `test`, `test:e2e`, `db:*`, `job:enqueue`).
- `src/server/config.ts` with the Zod environment schema and fail-fast startup;
  `.env.example` covering every variable in `CONFIGURATION.md`.
- Pino logger with categories and the redaction list.
- `docker-compose.dev.yml` with PostgreSQL 16; the module folder skeleton;
  Vitest and Playwright configured with one smoke test each.
- **Exit**: `npm run dev` serves a placeholder shell; `npm run lint`,
  `typecheck`, `test` are green; a missing `SESSION_SECRET` stops the app with a
  readable message.

### Phase 3 · Database and migrations
- Full `schema.prisma` from `DATABASE.md`; raw SQL migrations for `citext`,
  `pg_trgm`, partial unique indexes, `CHECK` constraints, `tsvector` + GIN,
  append-only grants.
- Prisma client singleton, transaction helper, repository conventions.
- `db:deploy`, `db:bootstrap`, `db:seed` scripts; seed covers permissions, roles,
  departments, groups, SLA policies, retention policies, email templates, job
  schedules, the three demo users and the "Introducing Kron PAM 4.0" fixture.
- **Exit**: migrations apply to an empty database in one pass; seed runs twice
  without error (idempotent); constraint tests prove the important invariants
  (duplicate email rejected, Entra user cannot hold a password hash, one open
  assignment per post).

---

## Milestone 1 — Identity (Phases 4–5)

### Phase 4 · Authentication
- `modules/auth/local`: Argon2id hashing, policy, login, lockout, reset, change.
- `modules/auth/session`: server-side sessions, cookie handling, idle/absolute
  timeout, rotation, revocation, logout-all.
- `modules/auth/saml`: metadata endpoint, AuthnRequest, ACS with the full
  validation list, replay guard, attribute mapping, JIT provisioning.
- Login screen, SAML button, forgot/reset screens, session middleware, CSRF.
- **Exit**: local login, lockout, reset and change all work end to end; SAML
  fixtures pass and every malformed variant is rejected with the right reason
  code; a disabled user's live session dies on the next request.

### Phase 5 · RBAC and authorization
- Permission catalogue seeded; `authorization.can/assert`; resource policies;
  capability serialisation for the UI; the protected-handler wrapper enforcing
  the five-step sequence.
- **Exit**: the permission × role × ownership unit matrix passes; every existing
  endpoint goes through `assert`; negative tests confirm employee-cannot-approve
  and cross-user-draft-access failures.

---

## Milestone 2 — Shell and content (Phases 6–10)

### Phase 6 · Application shell and design system
Sidebar, top bar, breadcrumbs, notification bell, user menu (password entry for
LOCAL users only), role-aware navigation, and the component inventory from
`UI_UX_SPEC.md` including `DataTable`, `StatusBadge`, `PriorityBadge`,
`SLAIndicator`, `EmptyState`, `ErrorState`, `Toast`, `ConfirmationDialog`.
**Exit**: shell renders for all three roles with correct navigation; axe reports
no violations on the shell; four breakpoints verified.

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

| Check | How |
| --- | --- |
| Migrations from scratch | drop database, `db:deploy`, `db:seed` |
| Authorization | negative tests for each new endpoint |
| Responsive | 1440 / 1280 / 900 / 390 px |
| Accessibility | axe on new screens, keyboard-only pass |
| No AI, no cloud | grep the diff for provider names and CDN URLs |
| Console/server errors | clean on every touched screen |
| Documentation | update the relevant `.md` in the same commit as the change |

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| SAML integration cannot be tested without a real tenant | Build against recorded fixtures and a stub IdP with a test certificate from Phase 4; schedule a tenant test as soon as the customer provides one |
| Video processing cost and image size on a modest VM | Cap size and count by configuration; process in the worker, never in the request path; document sizing |
| Version diff quality on rich text | Diff on extracted plain text plus a structural attachment/metadata delta; a full structural rich-text diff is a later enhancement, recorded as such |
| Retention deleting something wanted | Dry-run by default, run history, per-entity policies, backup-first guidance |
| Scope creep toward publishing or AI | Both are explicitly out of scope; any such request is a specification change, not a task |
| Air-gapped npm install during the build | Build images where registry access exists and transfer them (`docker save`/`load`), per `DEPLOYMENT.md` |

---

## Definition of done for the product

The acceptance list in §45 of the master specification, verbatim, plus:
migrations apply cleanly from empty, the full test suite passes in CI, a
clean-host install from `DEPLOYMENT.md` works on Docker and Podman, and a
restore drill from `BACKUP_RESTORE.md` succeeds.
