# Content Approval Platform

An internal, on-premise web application for creating social media / corporate
content, routing it through **human** approval, and keeping an auditable record
of every decision.

Employees draft content, attach images and video, and submit it. Approvers
review a specific immutable version, compare it with the previous one, discuss
it, and then approve, request changes, or reject it. Administrators configure
users, roles, routing rules, SLAs, email, retention and everything else from the
UI.

It is **not** a publishing tool: nothing is ever posted to LinkedIn, X, Facebook
or anywhere else. It contains **no AI functionality** of any kind, and it runs
entirely inside the customer's network — no cloud account required.

> **Status:** planning complete, implementation not yet started. See
> [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the phase order and
> current position.

---

## Documentation

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, modules, layers, decision log |
| [DATABASE.md](./DATABASE.md) | Entities, enums, indexes, constraints, migrations, seed |
| [AUTHENTICATION.md](./AUTHENTICATION.md) | Local auth, Entra ID SAML, sessions, RBAC |
| [API.md](./API.md) | REST surface, envelopes, status and error codes |
| [UI_UX_SPEC.md](./UI_UX_SPEC.md) | Design system, screens, the two hero screens |
| [SECURITY.md](./SECURITY.md) | Threat-to-control mapping, headers, upload rules |
| [CONFIGURATION.md](./CONFIGURATION.md) | Every environment variable and runtime setting |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Docker/Podman install, Nginx, TLS, scheduling, upgrades |
| [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | Backup, restore, disaster recovery |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Phases, exit criteria, risks |
| [CLAUDE.md](./CLAUDE.md) | Working agreement for contributors and agents |

---

## Technology

Next.js 15 (App Router) · React 19 · TypeScript 5 (strict) · Node.js 22 LTS ·
Tailwind CSS · shadcn/ui + Radix UI · Lucide · React Hook Form + Zod · Tiptap ·
TanStack Query + Table · date-fns · PostgreSQL 16 · Prisma + Prisma Migrate ·
Argon2id · SAML 2.0 · Nodemailer over SMTP · Sharp + FFmpeg · Pino ·
Vitest + Playwright · Docker / Podman · Nginx.

Architecture: a modular monolith — one web application, one worker, one
database.

---

## Prerequisites

| For | Requirement |
| --- | --- |
| Development | Node.js 22 LTS, npm 10+, Docker (for PostgreSQL), FFmpeg |
| Production | Linux (RHEL 8/9, Ubuntu LTS…), Docker 24+/Podman 4.4+, PostgreSQL 16+, Nginx |

FFmpeg (`ffmpeg` and `ffprobe`) is a server dependency used for video metadata
and poster frames. It ships inside the container image; for a bare-metal install
it must be present on the host.

---

## Local development

```bash
git clone <repository-url>
cd social-media-post-approval

npm ci

cp .env.example .env          # then set SESSION_SECRET, DATABASE_URL, …
docker compose -f docker-compose.dev.yml up -d    # PostgreSQL 16

npm run db:deploy             # apply migrations
npm run db:seed               # demo users, departments, hero post

npm run dev                   # http://localhost:3000
npm run worker                # second terminal: jobs and scheduler
```

Seed accounts (development only; the password is printed by the seed script and
never committed):

| Account | Role |
| --- | --- |
| `john.doe@example.local` | EMPLOYEE |
| `jane.manager@example.local` | APPROVER |
| `admin@example.local` | ADMIN |

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` / `start` | production build and run |
| `npm run worker` | background worker + scheduler |
| `npm run lint` / `typecheck` / `format` | code quality |
| `npm test` / `test:watch` | Vitest unit + integration |
| `npm run test:e2e` | Playwright end-to-end |
| `npm run db:deploy` / `db:migrate` / `db:seed` / `db:bootstrap` | database lifecycle |
| `npm run job:enqueue -- <TYPE>` | enqueue a job from cron or systemd |

---

## Configuration

Infrastructure and secrets come from environment variables, validated at
start-up — the process refuses to boot with a missing or nonsensical value.
Operational policy (SLA, retention, digest hour, email templates, approval
rules) lives in the database and is edited in Administration without a restart.

The essentials:

```
APP_URL=https://approval.corp.local
DATABASE_URL=postgresql://ca:…@postgres:5432/content_approval
SESSION_SECRET=<openssl rand -base64 48>
SMTP_HOST=smtp.corp.local
SMTP_FROM="Content Approval <no-reply@corp.local>"
STORAGE_PATH=/opt/content-approval/data/uploads
AUTH_SAML_ENABLED=true
```

Full table in [CONFIGURATION.md](./CONFIGURATION.md). Never commit `.env`.

---

## Deployment

```bash
cp .env.example .env && $EDITOR .env
docker compose up -d
docker compose exec app npm run db:deploy
docker compose exec app npm run db:bootstrap    # first admin account
curl -fsS https://approval.corp.local/api/health
```

Four services: `nginx`, `app`, `worker`, `postgres`. Podman is supported, and
so is an air-gapped install from a transferred image. Step-by-step instructions,
the Nginx configuration, scheduling options, upgrades and troubleshooting are in
[DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Testing

```bash
npm test          # unit + integration (integration needs PostgreSQL)
npm run test:e2e  # Playwright, against the real application
```

Integration tests run against a real PostgreSQL instance — SQLite is not used.
The E2E suite covers the whole business journey (draft → upload → submit →
review → request changes → new version → resubmit → compare → approve) plus the
authorization cases that must fail.

---

## Scope boundaries

**In scope:** content creation, versioning, human approval, collaboration,
notifications, email, SLA, retention, administration, reporting, auditability.

**Out of scope, deliberately:** publishing to social networks, any AI or LLM
feature, mandatory cloud services, Kubernetes, external analytics.

---

## License

See [LICENSE](./LICENSE).
