# Kron Social Approval

Internal corporate content approval and governance platform. Employees draft social media and
communication posts with text, images and video; those posts move through an approval workflow
before anything is published, and every step is auditable.

**Read [ARCHITECTURE.md](ARCHITECTURE.md) first.** It is the binding reference for this codebase —
module boundaries, entity model, API surface, the post lifecycle and every security decision live
there, and changes to it are how the design evolves.

## Current state

The two screens the product lives or dies by are built, on top of a real vertical slice: local
authentication with permission-based access control, drafts and immutable versions, media upload
with content sniffing, the approval state machine with SLA due dates, review discussion and an
in-app notification centre.

- **Post editor** (`/posts/:id/edit`) — write, preview and govern side by side, with media upload,
  an advisory content check, and a pre-submission review that makes "save" and "submit" impossible
  to confuse.
- **Approval review** (`/approvals/:id/review`) — content, decision context, AI findings, version
  comparison, history and discussion on one screen, with the decision always in reach.

**Appendix B of ARCHITECTURE.md** describes both screens in detail, including a table of what is
deliberately *not* built yet — SAML sign-in, the email outbox, the audit trail, antivirus scanning,
the S3 adapter, the background jobs and the admin panel. Read it before assuming a capability is
present.

## Stack

The complete, version-pinned register with the reasoning behind each choice is **Appendix A** of
ARCHITECTURE.md.

| Layer | Technology |
|---|---|
| Backend | Java 21, Spring Boot 4.1, modular monolith |
| Database | PostgreSQL 16, Flyway migrations, Spring Data JPA |
| Cache / sessions | Redis 7, Spring Session (opaque cookie, no JWT) |
| Object storage | S3-compatible via AWS SDK v2 (MinIO locally) |
| Queue / jobs | PostgreSQL work tables (`SKIP LOCKED`) + Spring Scheduling with ShedLock |
| Frontend | React 19, TypeScript 5.9, Vite, MUI v9, TanStack Query |
| Auth | Microsoft Entra ID (SAML 2.0) **and** local accounts — either or both |
| Observability | Micrometer + Prometheus, OpenTelemetry tracing, JSON logs |

## Running locally

```bash
cp .env.example .env
docker compose up -d              # postgres, redis, minio, mailpit, clamav

# Demo data: adds three users and a worked approval example (see ARCHITECTURE.md B.8)
cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=local,demo
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Sign in with `john.smith` (author), `sarah.johnson` (approver) or `admin`, password
`Demo!Passw0rd`. Those accounts exist **only** under the `demo` profile.

### A note on the SAML dependency

OpenSAML — the engine behind Spring Security's SAML 2.0 support — is published by the Shibboleth
Consortium rather than to Maven Central. Point Maven at your Nexus/Artifactory mirror of
`https://build.shibboleth.net/maven/releases/`, or build with `-DskipSaml` on a machine that cannot
reach it. **Release builds must never use `-DskipSaml`**: it drops Entra ID sign-in from the jar.

Useful local endpoints:

| URL | What |
|---|---|
| http://localhost:8080/api/v1/system/health | Application health |
| http://localhost:8080/api/v1/system/auth-methods | Which sign-in methods this deployment offers |
| http://localhost:8080/swagger-ui.html | API contract (local profile only; off in production) |
| http://localhost:8081/actuator/health | Liveness and readiness, on the management port |
| http://localhost:8025 | Mailpit — every outgoing mail lands here |
| http://localhost:9001 | MinIO console (`minioadmin` / `minioadmin`) |

## Verifying a change

```bash
cd backend  && mvn verify              # domain, lifecycle, SLA, sanitiser and ArchUnit boundary tests
cd frontend && npm run build           # typecheck + production build
cd frontend && npm test && npm run lint
cd frontend && npm run e2e             # Playwright, against a running backend on the demo profile
```

The end-to-end suite needs the backend on :8080 (profiles `local,demo`) and the dev server on :5173.
On a machine whose Chromium build does not match the pinned Playwright revision, point at the one
you have: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run e2e`.

The ArchUnit suite fails the build when a module reaches into another module's internals. That is
intentional: documented boundaries erode, checked ones do not.

## Repository layout

```
ARCHITECTURE.md      the design contract; Appendix A is the stack register
backend/             Spring Boot modular monolith (one package per bounded context)
frontend/            React SPA, one folder per feature slice
docker-compose.yml   local infrastructure; app images behind the "app" profile
```
