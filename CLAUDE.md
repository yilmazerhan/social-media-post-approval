# CLAUDE.md — Working Agreement for This Repository

This file is guidance for any developer or coding agent touching this repository.
It is deliberately short. The binding detail lives in the documents it points to.

## What this product is

An internal, on-premise **content approval platform**. Employees draft social
media / corporate content, submit it, and human approvers review, comment on,
request changes to, reject, or approve a **specific immutable version**.

It is *not* a publishing platform. It does *not* post to LinkedIn, X, Facebook
or anywhere else.

## Hard constraints (non-negotiable)

1. **No AI. Anywhere.** No LLM APIs, no moderation, no scoring, no grammar or
   tone analysis, no AI-named tables, endpoints, jobs, settings or UI labels.
   Every content check is deterministic and rule-based.
2. **No mandatory cloud.** The whole system runs inside a customer network with
   no Internet access. No S3, no Vercel, no SendGrid, no Redis, no Kafka, no
   Elasticsearch, no Kubernetes requirement.
3. **No external runtime assets.** No CDN scripts, no Google Fonts, no analytics.
   Everything is bundled locally.
4. **Only three external integrations are permitted**: Microsoft Entra ID over
   SAML 2.0, a corporate SMTP server, and (optionally) a customer-managed
   PostgreSQL server.
5. **Human approval is mandatory.** Nothing — including SLA expiry — ever
   approves content automatically.
6. **Authorization is server-side.** Hiding a button is not a security control.
7. **Approval binds to a version**, never to the mutable current post.

## Stack (do not substitute without a documented technical reason)

Next.js 15 (App Router) · React 19 · TypeScript 5 strict · Node.js 22 LTS ·
Tailwind CSS · shadcn/ui + Radix · Lucide · React Hook Form + Zod · Tiptap ·
TanStack Query + TanStack Table · date-fns · PostgreSQL 16 · Prisma + Prisma
Migrate · Argon2id · SAML 2.0 · Nodemailer/SMTP · Sharp + FFmpeg · Pino ·
Vitest + Playwright · ESLint + Prettier · npm · Docker/Podman · Nginx.

Architecture: **modular monolith**. No microservices.

## Read before you write code

| Document | What it settles |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Layers, modules, decisions (ADRs), concurrency, jobs |
| [DATABASE.md](./DATABASE.md) | Entities, enums, indexes, constraints, migration policy |
| [AUTHENTICATION.md](./AUTHENTICATION.md) | Local auth, SAML, sessions, lockout, RBAC enforcement |
| [API.md](./API.md) | Endpoint surface, response envelope, error codes |
| [UI_UX_SPEC.md](./UI_UX_SPEC.md) | Design system, screens, the two hero screens |
| [SECURITY.md](./SECURITY.md) | Control-by-threat mapping, headers, upload rules |
| [CONFIGURATION.md](./CONFIGURATION.md) | Every environment variable and its default |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Docker/Podman, Nginx, TLS, systemd, upgrades |
| [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | Backup, restore, disaster recovery |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Phase order, exit criteria, current status |

## House rules

- Business logic lives in `src/modules/<module>/`, never in a React component
  and never inline in a route handler. Route handlers parse, authorize, and
  delegate.
- Every mutating endpoint: authenticate → authorize → validate with Zod →
  execute in a transaction → write an audit entry.
- No `any`. No `as` used to silence the compiler. No hard-coded config.
- Prisma types stop at the module boundary; the API returns DTOs.
- Every workflow transition goes through the state machine in
  `src/modules/approvals/`. There is no second code path.
- Add a migration for every schema change. Never edit an applied migration.
- Finish a phase the way `IMPLEMENTATION_PLAN.md` defines "done" — including
  tests — before starting the next one.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
