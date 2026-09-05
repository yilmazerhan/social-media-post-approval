# ARCHITECTURE.md

Internal Content Approval Platform — architecture of record.
Status: **approved for implementation**. Supersedes any conflicting assumption
made elsewhere in the codebase.

---

## 1. System context

The platform runs entirely on customer-controlled Linux infrastructure. Three
external integrations exist, and only three:

| Integration | Direction | Purpose | Failure behaviour |
| --- | --- | --- | --- |
| Microsoft Entra ID (SAML 2.0) | Browser-mediated redirect/POST | Authentication for `ENTRA_ID` users | Local login continues to work |
| Corporate SMTP | Outbound from worker | Email delivery | Jobs retry with backoff; in-app notifications unaffected |
| PostgreSQL (optionally customer-managed) | Outbound from app + worker | Persistence | Application reports unhealthy |

Nothing else leaves the network. No telemetry, no CDN, no font service, no
update check.

```
                          ┌──────────────┐
                          │   Browser    │
                          └──────┬───────┘
                                 │ HTTPS (TLS terminated at Nginx)
                          ┌──────▼───────┐
                          │    Nginx     │  headers, body limits, redirect,
                          └──────┬───────┘  static assets, TLS
                                 │ HTTP (private network)
                   ┌─────────────▼──────────────┐
                   │        Next.js app         │
                   │  RSC + Route Handlers +    │
                   │  modules (business logic)  │
                   └───────┬────────────┬───────┘
                           │            │
              ┌────────────▼──┐   ┌─────▼────────────┐
              │  PostgreSQL   │   │  Local filesystem│
              │   (16+)       │   │  STORAGE_PATH    │
              └───────▲───────┘   └─────▲────────────┘
                      │                 │
              ┌───────┴─────────────────┴───────┐
              │  Worker process (Node.js)       │
              │  queue consumer + scheduler     │
              └───────┬─────────────────────────┘
                      │ SMTP
              ┌───────▼───────┐
              │ Corporate MTA │
              └───────────────┘
```

The app and the worker share one codebase and one database. They are separate
OS processes so either can be restarted without touching the other.

---

## 2. Architectural style

A **modular monolith**. One deployable web application, one worker, organised
internally into modules with explicit boundaries.

Why not microservices: the workload is a single team's internal tool with
strongly coupled entities (post ↔ version ↔ approval ↔ audit) and a hard
requirement for transactional workflow transitions. Distributed transactions
would buy nothing and cost operability in an air-gapped datacentre. See
[ADR-001](#adr-001-modular-monolith).

### Layers

```
Presentation   React Server/Client Components, design system
API            Next.js Route Handlers under /api/v1  — parse, authz, delegate
Application    module services — use cases, transactions, orchestration
Domain         entities, state machine, policies, pure rules (no I/O)
Persistence    Prisma client, repositories where they earn their keep
Infrastructure storage, SMTP, SAML, hashing, logging, queue
```

The dependency rule points inward: domain knows nothing about Prisma, HTTP,
React or Nodemailer. Infrastructure implements interfaces the application layer
declares.

### Directory layout

```
src/
  app/                     Next.js App Router
    (auth)/                login, SAML callback, password reset
    (app)/                 authenticated shell
      dashboard/
      posts/               my posts, editor, details
      approvals/           queue, review
      notifications/
      reports/
      admin/
    api/
      v1/                  REST route handlers
      health/  ready/      liveness / readiness
  components/
    ui/                    shadcn/ui primitives (generated, lightly patched)
    app/                   composed product components (StatusBadge, DataTable…)
  modules/
    auth/                  local/, saml/, session/, password/
    authorization/         RBAC, policies, can()
    users/                 users, departments, groups
    posts/                 posts, versions, editor validation
    attachments/           upload pipeline, media processing
    approvals/             state machine, routing rules, assignment, actions
    comments/              comments, mentions
    notifications/         in-app notifications
    email/                 EmailService, templates, EmailLog
    sla/                   policies, due-date maths, escalation
    retention/             policies, dry-run, cleanup
    audit/                 append-only audit writer + query
    reports/               aggregates, CSV export
    administration/        system settings
  lib/                     zod helpers, result types, date, csv, diff, errors
  server/
    db.ts                  Prisma client singleton
    config.ts              validated env (fail-fast)
    logger.ts              Pino instances per category
    http/                  envelope, error mapper, rate limit, CSRF, context
  jobs/
    worker.ts              entry point (npm run worker)
    scheduler.ts           recurring schedule evaluation
    handlers/              one file per job type
prisma/
  schema.prisma
  migrations/
  seed.ts
docs/                      diagrams, ADR extras
tests/
  unit/  integration/  e2e/
```

Module rules:

- A module exposes a public surface via its `index.ts`. Cross-module imports go
  through that surface only — never into another module's internals.
- Modules may depend on `lib/`, `server/`, and the modules listed in their own
  README header. Circular dependencies are a build error.
- `audit`, `notifications` and `email` are leaf infrastructure-ish modules that
  others call; they never call back into `posts` or `approvals`.

---

## 3. Request lifecycle

Every mutating API request follows the same sequence. It is implemented once,
in `server/http/handler.ts`, and reused:

1. **Resolve context** — session cookie → `Session` row → `User` + roles +
   permissions. Disabled user or revoked session ⇒ 401 and cookie cleared.
2. **CSRF** — for `POST/PUT/PATCH/DELETE`: verify `Origin`/`Sec-Fetch-Site` and
   the double-submit CSRF token.
3. **Rate limit** — per route class (auth, upload, general).
4. **Validate** — Zod schema for params, query and body. Failure ⇒ 422 with
   field errors.
5. **Authorize** — `authorization.can(user, permission, resource)`. The resource
   is loaded first when the decision depends on ownership or assignment, so
   IDOR is impossible by construction.
6. **Execute** — call one module service. The service owns the transaction.
7. **Audit** — inside the same transaction for business-critical actions.
8. **Respond** — DTO through the standard envelope; errors through the mapper.

Read requests skip steps 2–3 but never skip 1, 4 and 5.

Server Components read through the same module services (not raw Prisma) so
authorization and DTO shaping stay in one place.

---

## 4. Domain model overview

Full field-level detail lives in [DATABASE.md](./DATABASE.md). The shape of the
domain:

- **User** — one entity for both providers. `authProvider ∈ {LOCAL, ENTRA_ID}`.
  Roles attach through `UserRole`; permissions come from `RolePermission`.
- **Post** — mutable header (title, department, priority, status, routing,
  pointers to current and approved version). Never holds approvable content
  itself.
- **PostVersion** — immutable snapshot: title, Tiptap JSON, sanitized HTML,
  plain text (for search and diffing), attachment set, author, created time.
  Once created it is never updated.
- **Attachment** — file metadata; binary lives on disk. Bound to versions
  through `PostVersionAttachment` so one uploaded file can be shared by
  successive versions without duplication.
- **ApprovalAssignment** — who is expected to act, when it is due, its state.
- **ApprovalAction** — append-only decision log; every row names the exact
  `postVersionId` it acted on.
- **Comment / Notification / EmailLog / AuditLog / BackgroundJob** — supporting
  entities, all append-oriented.

### Workflow state machine

```
        ┌─────────┐  submit   ┌───────────┐  start_review  ┌───────────┐
        │  DRAFT  ├──────────►│ SUBMITTED ├───────────────►│ IN_REVIEW │
        └────┬────┘           └─────┬─────┘                └─────┬─────┘
             │ cancel               │ cancel                     │
             │                      │                            ├── approve ──► APPROVED
             ▼                      ▼                            ├── reject ───► REJECTED
        CANCELLED               CANCELLED                        └── request_changes
                                                                        │
                                                                        ▼
                                                             CHANGES_REQUESTED
                                                                        │ resubmit
                                                                        ▼
                                                                   SUBMITTED
```

Terminal-ish: `APPROVED`, `REJECTED`, `CANCELLED`. `ARCHIVED` is reachable from
any terminal state via retention or an explicit admin action.

Editing an `APPROVED` post is allowed only by creating a **new version**, which
moves the post back to `DRAFT` and clears `approvedVersionId` from the post
header. The historical approval row survives and still points at the version it
approved — principle 6 of the specification.

The machine is a single table of legal `(fromStatus, action, toStatus)` triples
plus per-transition guards (permission, ownership, assignment, mandatory
comment). `posts` and `approvals` both call it; there is no second path.

### Versioning rules

- A version is created when: a draft is submitted, a `CHANGES_REQUESTED` post is
  resubmitted, or an approved post is edited.
- Draft edits mutate the working draft (`Post.draftContent`) and **do not**
  create versions; only submission freezes a version. This keeps autosave cheap
  and version history meaningful.
- `Post.currentVersionId` — latest frozen version.
  `Post.approvedVersionId` — the version an approver actually approved.
  They can differ; the UI always shows both.

### Concurrency

Optimistic locking with a monotonic `Post.lockVersion` integer:

```
UPDATE "Post" SET ..., "lockVersion" = "lockVersion" + 1
 WHERE id = $1 AND "lockVersion" = $2
```

Zero rows affected ⇒ `409 CONFLICT` with code `STALE_RESOURCE`. Clients send
the `lockVersion` they rendered. The Approval Review screen also polls the
post's `lockVersion`/status and raises a non-blocking concurrency banner when
another actor moved the post while the reviewer was reading — see
[UI_UX_SPEC.md](./UI_UX_SPEC.md). Approval submits the reviewed
`postVersionId`; if that is no longer the version awaiting decision, the action
is refused. Two approvers cannot both win.

Workflow transitions run inside `READ COMMITTED` transactions with a
`SELECT … FOR UPDATE` on the post row, which serialises concurrent decisions on
the same post without a global lock.

---

## 5. Authentication and authorization

Detail in [AUTHENTICATION.md](./AUTHENTICATION.md). Architectural summary:

- **Provider modules** implement a common `AuthenticationProvider` boundary:
  `local` (Argon2id) and `saml` (Entra ID). Both resolve to the same internal
  `User`.
- **Sessions** are server-side rows keyed by a random opaque id, referenced by a
  signed, `HttpOnly`, `SameSite=Lax`, `Secure`-in-production cookie. Server-side
  storage is what makes "logout everywhere", admin-triggered revocation and
  disabled-user invalidation actually work — a stateless JWT cannot.
- **Authorization** is one service: `authorization.can(user, permission,
  resource?)`. Role→permission grants answer the coarse question; resource
  policies (`ownsPost`, `isAssignedApprover`, `sameDepartment`) answer the fine
  one. UI visibility is derived from the same function, so the screen and the
  server never disagree.

---

## 6. File storage and media

`FileStorage` is an interface; `LocalFileStorage` is the only implementation
shipped.

```ts
interface FileStorage {
  save(input: SaveInput): Promise<StoredObject>
  read(key: string): Promise<Readable>
  stat(key: string): Promise<ObjectStat>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

Keys are opaque (`{yyyy}/{mm}/{uuid}{ext}`) and resolved against `STORAGE_PATH`
with a normalised-path check that rejects anything escaping the root. Clients
never see a filesystem path; they get `/api/v1/attachments/:id/content`, which
authorizes per request and streams the file.

Upload pipeline (all server-side, all local):

1. Stream to a temp file under `STORAGE_PATH/tmp` with a hard size cap.
2. Extension allowlist + declared MIME check.
3. **Magic-byte sniff** of the real content; mismatch with the extension is a
   rejection, not a warning.
4. SVG is rejected outright — it is a script container. Images are re-encoded
   through Sharp, which strips embedded metadata and any hostile payload.
5. Video: `ffprobe` for duration/codec/dimensions, `ffmpeg` for a poster frame.
   Malformed containers fail the probe and are rejected.
6. Compute SHA-256, move into place, persist `Attachment`, generate thumbnails.
7. Temp files older than `UPLOAD_TMP_TTL_MINUTES` are swept by a job.

FFmpeg is a documented server dependency (present in the app image). Nothing is
ever sent to an external processing service.

---

## 7. Background jobs and scheduling

A PostgreSQL-backed queue. No Redis, no broker.

- **Claim**: `SELECT … FROM "BackgroundJob" WHERE status='PENDING' AND
  "scheduledAt" <= now() ORDER BY priority, "scheduledAt" FOR UPDATE SKIP
  LOCKED LIMIT n` — the standard Postgres queue pattern, safe for multiple
  workers.
- **Lifecycle**: `PENDING → RUNNING → SUCCEEDED | FAILED | DEAD`, with
  `attempts`, `maxAttempts`, exponential backoff, `lastError`, and a
  `lockedBy` / `lockedAt` pair so a crashed worker's jobs are reclaimed after
  `JOB_STALE_AFTER_SECONDS`.
- **Idempotency**: an optional unique `idempotencyKey` (e.g.
  `digest:2026-09-05:user-42`) makes re-enqueue and re-run harmless.
- **Job types**: `EMAIL_SEND`, `DAILY_DIGEST`, `SLA_CHECK`, `SLA_ESCALATE`,
  `RETENTION_CLEANUP`, `ORPHAN_ATTACHMENT_CLEANUP`, `TEMP_FILE_CLEANUP`,
  `SESSION_CLEANUP`, `NOTIFICATION_FANOUT`.
- **Scheduler**: a `JobSchedule` table holds cron expressions evaluated by the
  worker's tick loop (default every 30s); each due schedule enqueues a job with
  an idempotency key derived from its slot, so a duplicated tick cannot
  double-run it. For sites that prefer OS-level scheduling, the same jobs can be
  enqueued by `npm run job:enqueue -- <TYPE>` from cron or a systemd timer;
  both approaches are documented in [DEPLOYMENT.md](./DEPLOYMENT.md).

The worker is stateless and independently restartable. Killing it mid-job loses
nothing: the job returns to `PENDING` after the stale timeout.

---

## 8. Email

`EmailService` renders a template + payload into a queued `EMAIL_SEND` job and
an `EmailLog` row. `SMTPEmailProvider` (Nodemailer) performs delivery in the
worker, never in the request path — a slow corporate MTA must never stall an
approval click. Retries use the queue's backoff. Templates live in the database
(`EmailTemplate`, seeded from files) so administrators can edit subject and body
without a redeploy; rendering escapes all interpolated values.

---

## 9. Observability

- **Logging**: Pino, JSON to stdout, with named child loggers for `app`,
  `security`, `auth`, `audit`, `worker`, `http`. A redaction list covers
  password, cookie, authorization, token, `SAMLResponse` and SMTP credentials.
  Container stdout is collected by the host's logging setup.
- **Audit**: business and security events go to the `AuditLog` **table**, not to
  log files. Append-only: no service exposes update or delete, and the
  application's DB role is granted only `INSERT`/`SELECT` on it.
- **Health**: `/api/health` (process liveness, no dependencies) and
  `/api/ready` (database, storage writability, worker heartbeat, SMTP
  configuration presence). The admin System Health page reads the same probes.

---

## 10. Configuration

`server/config.ts` parses `process.env` through a Zod schema at startup and
exits non-zero with a readable list when something mandatory is missing or
malformed. Nothing else in the codebase reads `process.env` directly. Full table
in [CONFIGURATION.md](./CONFIGURATION.md).

Operational settings that administrators should change without a restart (SLA
policies, retention windows, email templates, digest hour, session timeouts)
live in the database as `SystemSetting` rows with typed accessors and a cache
that invalidates on write. Infrastructure settings (database URL, secrets, SMTP
host, SAML certificate, storage path) stay in the environment.

---

## 11. Testing strategy

| Level | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest | state machine, RBAC decisions, SLA maths, retention selection, validation, version diff, password policy |
| Integration | Vitest + real PostgreSQL | Prisma queries, transactions, upload pipeline, queue claim/retry, email logging, notification fan-out, SAML response validation against fixtures |
| E2E | Playwright | the 21-step business journey in the master spec, plus explicit negative-authorization cases |

Integration tests run against a disposable PostgreSQL (compose service or
`postgres` in CI), migrated fresh, seeded per test file. SQLite is not used.

---

## 12. Decision log

### ADR-001 Modular monolith
**Decision**: one Next.js application plus one worker, internally modular.
**Why**: air-gapped operability, transactional workflow, a small operations
surface (four containers). **Rejected**: microservices — no independent scaling
need, and distributed transactions would complicate the one thing that must be
correct.

### ADR-002 Custom session layer instead of Auth.js adapters
**Decision**: implement session issuance/validation/revocation in
`modules/auth/session`, backed by a `Session` table and a signed cookie.
**Why**: the requirements demand admin-side revocation, "logout all sessions",
idle timeout and immediate invalidation on user disablement — all of which need
server-side session state. SAML with Entra also needs response-level validation
that Auth.js does not provide out of the box, which the stack document itself
calls out. **Consequence**: we own ~400 lines of session code and test it
directly. **Compatible with** the Auth.js architecture should we later adopt it
for additional providers.

### ADR-003 SAML via a maintained Node library
**Decision**: use `@node-saml/node-saml` for SP-side SAML 2.0 handling, wrapped
in `modules/auth/saml` behind our own provider interface.
**Why**: signature, issuer, audience, destination and timestamp validation are
easy to get subtly wrong; a maintained library plus our own explicit assertions
and replay cache is the responsible choice. **Consequence**: library upgrades
are security-relevant and tracked.

### ADR-004 Argon2id for local passwords
**Decision**: `@node-rs/argon2` (native, no build toolchain at runtime),
Argon2id, parameters from RFC 9106's recommendations and OWASP guidance,
tunable by environment. **Why**: memory-hard, current best practice.
**Rejected**: bcrypt (72-byte input limit, not memory-hard).

### ADR-005 PostgreSQL-backed job queue
**Decision**: jobs in the application database, claimed with `FOR UPDATE SKIP
LOCKED`. **Why**: the requirement is explicitly "no Redis/Kafka/RabbitMQ unless
unavoidable"; our throughput is a few thousand jobs a day. **Consequence**:
queue depth shares the database's fate — acceptable, since nothing works without
the database anyway.

### ADR-006 Versions freeze at submission, not on every edit
**Decision**: autosave mutates the draft; submission freezes an immutable
`PostVersion`. **Why**: version history is a review artefact, not an undo log;
one version per submission is what approvers reason about. **Consequence**:
draft recovery is served by the draft record itself, and an approved post that
is edited returns to `DRAFT` with a new version pending.

### ADR-007 Tiptap JSON as the source of truth, sanitized HTML as a derivative
**Decision**: store the editor's JSON document plus a server-sanitized HTML
rendering plus extracted plain text. **Why**: JSON survives editor upgrades and
enables structural diffing; HTML is never trusted from the client — it is
regenerated and sanitized server-side; plain text feeds PostgreSQL full-text
search and the version diff. **Consequence**: rendering never injects
client-supplied HTML.

### ADR-008 PostgreSQL full-text search
**Decision**: `tsvector` columns with GIN indexes over title and plain-text
body, plus trigram indexes for name lookups. **Why**: the requirement forbids
Elasticsearch without proven need; Postgres handles this corpus comfortably.

### ADR-009 Server-side rendering by default
**Decision**: React Server Components for reads; Client Components only where
interaction requires it (editor, decision panel, tables, uploader). TanStack
Query only for client-held server state. **Why**: fewer round trips, less
client state, and authorization stays server-side.

---

## 13. References

- Next.js App Router — https://nextjs.org/docs/app
- React 19 — https://react.dev/blog/2024/12/05/react-19
- Prisma ORM — https://www.prisma.io/docs
- PostgreSQL `SKIP LOCKED` queues — https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE
- PostgreSQL full-text search — https://www.postgresql.org/docs/16/textsearch.html
- RFC 9106 (Argon2) — https://www.rfc-editor.org/rfc/rfc9106.html
- OWASP Password Storage Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OASIS SAML 2.0 Core — https://docs.oasis-open.org/security/saml/v2.0/saml-core-2.0-os.pdf
- Microsoft Entra ID SAML single sign-on — https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-saml-single-sign-on
- `@node-saml/node-saml` — https://github.com/node-saml/node-saml
- Nodemailer — https://nodemailer.com/
- Sharp — https://sharp.pixelplumbing.com/
- FFmpeg — https://ffmpeg.org/documentation.html
- Pino — https://getpino.io/
- Tiptap — https://tiptap.dev/docs
- TanStack Query / Table — https://tanstack.com/query/latest · https://tanstack.com/table/latest
- Vitest — https://vitest.dev/ · Playwright — https://playwright.dev/
