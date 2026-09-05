# API.md

REST over Next.js Route Handlers, versioned under `/api/v1`. JSON in, JSON out.
Session cookie authentication; CSRF token on every unsafe method.

---

## 1. Conventions

- **Base path** `/api/v1`. A breaking change means `/api/v2`, not a silent
  mutation of `v1`.
- **Methods**: `GET` read, `POST` create/action, `PATCH` partial update,
  `PUT` full replace (rare), `DELETE` remove.
- **Content type** `application/json`, except uploads (`multipart/form-data`)
  and file downloads/exports.
- **Timestamps** ISO-8601 UTC with `Z`.
- **Ids** are UUID strings. Prisma models, column names and internal paths are
  never exposed.
- **Idempotency**: workflow actions accept an `Idempotency-Key` header; a repeat
  with the same key returns the original result instead of acting twice.
- **Optimistic locking**: mutations on a post send `lockVersion`; a mismatch is
  `409 STALE_RESOURCE`.

### Success envelope
```json
{ "data": { }, "meta": { } }
```
List responses:
```json
{
  "data": [ ],
  "meta": { "page": 1, "pageSize": 25, "total": 137, "totalPages": 6,
            "sort": "updatedAt", "order": "desc" }
}
```

### Error envelope
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some fields need attention.",
    "details": [ { "field": "title", "message": "Title is required." } ],
    "traceId": "01J8Z…"
  }
}
```
`message` is safe to render to a user. Stack traces, SQL, filesystem paths and
configuration values never appear; `traceId` correlates with the server log.

### Status codes
| Code | Used for |
| --- | --- |
| 200 | successful read / action |
| 201 | resource created (with `Location`) |
| 202 | accepted, queued (e.g. export, test email) |
| 204 | successful delete |
| 400 | malformed request |
| 401 | no or invalid session |
| 403 | authenticated but not permitted |
| 404 | not found **or** not visible to this user (no existence leak) |
| 409 | state conflict — `STALE_RESOURCE`, `INVALID_TRANSITION`, `ALREADY_DECIDED` |
| 413 | upload too large |
| 415 | unsupported media type |
| 422 | validation failed |
| 429 | rate limited (`Retry-After`) |
| 500 | unexpected — logged with `traceId`, generic message to the client |
| 503 | dependency unavailable (readiness) |

### Error codes
`UNAUTHENTICATED`, `SESSION_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`,
`VALIDATION_FAILED`, `INVALID_TRANSITION`, `STALE_RESOURCE`, `ALREADY_DECIDED`,
`ASSIGNMENT_NOT_YOURS`, `COMMENT_REQUIRED`, `FILE_TYPE_REJECTED`,
`FILE_TOO_LARGE`, `UPLOAD_FAILED`, `RATE_LIMITED`, `CSRF_FAILED`,
`ACCOUNT_LOCKED`, `PROVIDER_MISMATCH`, `INTERNAL_ERROR`.

### Pagination, sorting, filtering
`?page=1&pageSize=25&sort=updatedAt&order=desc&q=pam&status=IN_REVIEW&
priority=HIGH&departmentId=…&creatorId=…&from=…&to=…`
`pageSize` max 100. `q` runs PostgreSQL full-text search over title and body
text. Unknown parameters are rejected (422) rather than ignored.

---

## 2. Endpoint surface

### Auth — `/api/v1/auth`
| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| POST | `/login` | public | local login; rate limited |
| POST | `/logout` | session | revokes current session |
| POST | `/logout-all` | session | revokes every session of the user |
| GET | `/session` | session | current user, roles, capabilities, timezone |
| GET | `/sessions` | session | the user's active sessions |
| DELETE | `/sessions/:id` | session | revoke one of my sessions |
| POST | `/password/change` | session (LOCAL) | current + new password |
| POST | `/password/forgot` | public | neutral response always |
| POST | `/password/reset` | public | token + new password |
| GET | `/saml/login` | public | SP-initiated redirect |
| POST | `/saml/acs` | public | assertion consumer |
| GET | `/saml/metadata` | public | SP metadata XML |
| GET/POST | `/saml/logout` | public | single logout |

### Posts — `/api/v1/posts`
| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/` | `POST_READ_OWN` / `POST_READ_ALL` | scoped list; tabs map to `status` filters |
| POST | `/` | `POST_CREATE` | creates a `DRAFT` |
| GET | `/:id` | read policy | full detail incl. versions, actions, capabilities |
| PATCH | `/:id` | `POST_EDIT_OWN` | metadata + draft content; requires `lockVersion` |
| DELETE | `/:id` | `POST_DELETE_OWN` | drafts only; soft delete |
| POST | `/:id/autosave` | `POST_EDIT_OWN` | lightweight draft save, returns `draftUpdatedAt` |
| POST | `/:id/submit` | `POST_SUBMIT` | freezes a version, resolves route, assigns, notifies |
| POST | `/:id/cancel` | `POST_CANCEL` | creator or admin |
| POST | `/:id/duplicate` | `POST_CREATE` | new draft seeded from a version |
| GET | `/:id/validate` | read policy | deterministic submission-readiness checklist |
| GET | `/:id/versions` | read policy | version list |
| GET | `/:id/versions/:versionId` | read policy | one immutable version |
| GET | `/:id/versions/compare?from=&to=` | read policy | text + attachment diff |
| GET | `/:id/comments` | read policy | threaded |
| POST | `/:id/comments` | `POST_COMMENT` | body, optional `postVersionId`, mentions parsed server-side |
| PATCH | `/:id/comments/:commentId` | author | edit window |
| DELETE | `/:id/comments/:commentId` | author or admin | soft delete |
| GET | `/:id/activity` | read policy | merged timeline of actions, comments, versions |

### Attachments — `/api/v1/attachments`
| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| POST | `/` | `POST_CREATE` | `multipart/form-data`, one file; returns metadata + `TEMPORARY` status |
| GET | `/:id/content` | read policy on the owning post (or uploader while temporary) | streams the file, `Content-Disposition: attachment`, no-sniff |
| GET | `/:id/thumbnail` | same | generated preview |
| DELETE | `/:id` | uploader or `POST_EDIT_OWN` | detaches; the file is removed by the orphan job |

### Approvals — `/api/v1/approvals`
| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/queue` | `APPROVAL_READ` | my queue: filters `dueSoon`, `overdue`, priority, department |
| GET | `/:postId` | `APPROVAL_READ` + policy | review payload: post, version under review, previous version, diff, history, SLA, comments |
| POST | `/:postId/start-review` | assigned approver | `SUBMITTED → IN_REVIEW`; idempotent |
| POST | `/:postId/approve` | `POST_APPROVE` | body: `postVersionId`, `lockVersion`, optional comment |
| POST | `/:postId/request-changes` | `POST_REQUEST_CHANGES` | comment **mandatory** |
| POST | `/:postId/reject` | `POST_REJECT` | reason **mandatory** |
| POST | `/:postId/assign` | `APPROVAL_ASSIGN` | assign or reassign |
| GET | `/next?after=:postId` | `APPROVAL_READ` | next item in the queue for keyboard flow |

Every decision body carries the `postVersionId` the reviewer actually read. If
that is not the version awaiting decision, the response is
`409 ALREADY_DECIDED` — approving a stale version is structurally impossible.

### Notifications — `/api/v1/notifications`
`GET /` (filters `unread`, `mentions`), `GET /unread-count`,
`POST /:id/read`, `POST /read-all`, `GET /preferences`, `PATCH /preferences`.

### Reports — `/api/v1/reports`
`GET /summary`, `/throughput`, `/approval-time`, `/sla-compliance`,
`/by-department`, `/by-creator`, `/by-approver`, `/rejections`.
Every report accepts `from`, `to`, `departmentId`, `priority`, and
`format=json|csv`. CSV is streamed with a `text/csv` content type and a
formula-injection guard on leading `= + - @` characters.

### Users, departments, groups — `/api/v1/users`, `/departments`, `/groups`
`GET /users` (`USER_READ`), `POST`, `GET /:id`, `PATCH /:id`,
`POST /:id/enable`, `POST /:id/disable` (revokes sessions),
`POST /:id/roles`, `DELETE /:id/roles/:roleId`,
`POST /:id/password-reset` (LOCAL only — `409 PROVIDER_MISMATCH` for Entra),
`GET /:id/sessions`, `DELETE /:id/sessions`.
`GET /users/mentionable?q=` powers `@` autocomplete and returns only users the
caller may mention.

### Administration — `/api/v1/admin`
| Area | Endpoints |
| --- | --- |
| Roles | `GET/POST /roles`, `PATCH /roles/:id`, `GET /permissions` |
| Approval rules | `GET/POST /approval-rules`, `PATCH`/`DELETE /:id`, `POST /approval-rules/preview` (dry-run routing for a hypothetical post) |
| SLA | `GET/POST /sla-policies`, `PATCH`/`DELETE /:id` |
| Email | `GET/PATCH /email/settings`, `POST /email/test`, `GET/PATCH /email/templates/:key`, `POST /email/templates/:key/preview`, `GET /email/logs` |
| Retention | `GET/PATCH /retention-policies`, `POST /retention/run` (`dryRun` default true), `GET /retention/runs` |
| Jobs | `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/retry`, `POST /jobs/:id/cancel`, `GET/PATCH /job-schedules`, `POST /job-schedules/:key/run-now` |
| Audit | `GET /audit-logs` (filters + CSV export) — read-only, no write endpoint exists |
| Settings | `GET/PATCH /settings` |
| Health | `GET /system/health` (detailed, admin-only view of the probes) |

### Health — unversioned
`GET /api/health` → `200 {"status":"ok"}`, no dependency checks, safe for a
container liveness probe.
`GET /api/ready` → checks database, storage writability, worker heartbeat and
SMTP configuration; `200` or `503` with a per-check breakdown. Never exposes
hostnames, credentials or versions to an unauthenticated caller.

---

## 3. Representative payloads

**Submit**
```http
POST /api/v1/posts/8f2…/submit
X-CSRF-Token: …
{ "lockVersion": 4, "changeSummary": "Reworded the CTA", "confirm": true }
```
```json
{ "data": { "postId": "8f2…", "reference": "POST-2026-000412",
            "status": "SUBMITTED", "version": 3,
            "assignedApprover": { "id": "…", "displayName": "Jane Manager" },
            "dueAt": "2026-09-05T15:00:00Z" } }
```

**Approve**
```http
POST /api/v1/approvals/8f2…/approve
{ "postVersionId": "b71…", "lockVersion": 7, "comment": "Good to go." }
```
```json
{ "data": { "status": "APPROVED", "approvedVersion": 3,
            "approvedBy": { "id": "…", "displayName": "Jane Manager" },
            "approvedAt": "2026-09-05T09:41:12Z" } }
```

**Request changes without a comment**
```json
{ "error": { "code": "COMMENT_REQUIRED",
             "message": "Explain what needs to change before returning this post.",
             "details": [ { "field": "comment", "message": "Required." } ] } }
```

---

## 4. Rate limiting

| Class | Default | Key |
| --- | --- | --- |
| `auth` (login, forgot, reset) | 10 / 15 min | IP + email |
| `upload` | 30 / 5 min | user |
| `mutation` | 120 / min | user |
| `read` | 600 / min | user |
| `export` | 5 / min | user |

Counters live in PostgreSQL for auth (durable, shared across replicas) and in
process memory for the rest. Exceeding a limit returns `429` with `Retry-After`
and writes a `security` log line.

---

## 5. Non-goals

No public API, no API keys, no OAuth client credentials, no webhooks, no
GraphQL, no social-network publishing endpoints, and no AI endpoints of any
kind. Adding any of these is a specification change, not an implementation
detail.

---

## 6. References

- Next.js Route Handlers — https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- MDN HTTP status codes — https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
- OWASP REST Security Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- OWASP CSV Injection — https://owasp.org/www-community/attacks/CSV_Injection
- Zod — https://zod.dev/
