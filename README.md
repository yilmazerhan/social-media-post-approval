# Kron Social Approval

Internal corporate content approval and governance platform. Employees draft social media and
communication posts with text, images and video; those posts move through an approval workflow
before anything is published, and every step is auditable.

**Read [ARCHITECTURE.md](ARCHITECTURE.md) first.** It is the binding reference for this codebase —
module boundaries, entity model, API surface, the post lifecycle and every security decision live
there, and changes to it are how the design evolves.

## Current state — Phase 0

Only the skeleton exists: build files, module packages, validated configuration, the error model,
a Flyway baseline, a health endpoint and the local infrastructure stack. No business feature is
implemented yet. Features arrive per the phase plan in ARCHITECTURE.md section 19.2, and each
phase must leave the previous ones intact.

## Stack

| Layer | Technology |
|---|---|
| Backend | Java 21, Spring Boot 3.5, modular monolith |
| Database | PostgreSQL 16, Flyway migrations |
| Cache / sessions | Redis 7 |
| Object storage | S3-compatible (MinIO locally) |
| Frontend | React 19, TypeScript, Vite, TanStack Query |
| Auth | Microsoft Entra ID (SAML 2.0) **and** local accounts — either or both |

## Running locally

```bash
cp .env.example .env
docker compose up -d              # postgres, redis, minio, mailpit, clamav

cd backend && mvn spring-boot:run # http://localhost:8080
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Useful local endpoints:

| URL | What |
|---|---|
| http://localhost:8080/api/v1/system/health | Application health |
| http://localhost:8080/api/v1/system/auth-methods | Which sign-in methods this deployment offers |
| http://localhost:8025 | Mailpit — every outgoing mail lands here |
| http://localhost:9001 | MinIO console (`minioadmin` / `minioadmin`) |

## Verifying a change

```bash
cd backend  && mvn verify     # unit, slice, integration and ArchUnit boundary tests
cd frontend && npm run build  # typecheck + production build
```

The ArchUnit suite fails the build when a module reaches into another module's internals. That is
intentional: documented boundaries erode, checked ones do not.

## Repository layout

```
ARCHITECTURE.md      the design contract
backend/             Spring Boot modular monolith (one package per bounded context)
frontend/            React SPA, one folder per feature slice
docker-compose.yml   local infrastructure
```
