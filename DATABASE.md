# DATABASE.md

PostgreSQL 16+, accessed exclusively through Prisma ORM and Prisma Migrate.
This document is the schema of record; `prisma/schema.prisma` implements it.

---

## 1. Conventions

- **Identifiers**: UUID v4 primary keys (`@default(uuid())`), except append-only
  high-volume logs (`AuditLog`, `EmailLog`, `BackgroundJob`) which use `bigint`
  identity columns for index locality.
- **Timestamps**: every table has `createdAt`; mutable tables also have
  `updatedAt`. All values are stored as `timestamptz` in **UTC**. Conversion to
  the display timezone happens at the presentation layer only.
- **Soft deletion**: `deletedAt` on `User`, `Department`, `Group`, `Post`,
  `Comment`, `Attachment`. Immutable records (`PostVersion`, `ApprovalAction`,
  `AuditLog`) are never soft-deleted — retention hard-deletes them under an
  explicit policy.
- **Naming**: PascalCase models, camelCase fields, plural nothing. Enums are
  SCREAMING_SNAKE.
- **Money/no floats**: not applicable; durations are stored as integer minutes.
- **Every foreign key is indexed.** Composite indexes follow the actual query
  order used by the list screens.

---

## 2. Enums

```prisma
enum AuthProvider        { LOCAL  ENTRA_ID }
enum UserStatus          { ACTIVE  DISABLED  LOCKED  PENDING }
enum PostStatus          { DRAFT  SUBMITTED  IN_REVIEW  APPROVED  REJECTED
                           CHANGES_REQUESTED  CANCELLED  ARCHIVED }
enum Priority            { LOW  NORMAL  HIGH  URGENT }
enum ApprovalActionType  { SUBMIT  ASSIGN  START_REVIEW  APPROVE  REJECT
                           REQUEST_CHANGES  RESUBMIT  CANCEL  REASSIGN }
enum AssignmentStatus    { PENDING  IN_PROGRESS  COMPLETED  CANCELLED  ESCALATED }
enum ApproverTargetType  { USER  GROUP  DEPARTMENT_MANAGER }
enum AttachmentKind      { IMAGE  VIDEO }
enum AttachmentStatus    { TEMPORARY  ATTACHED  ORPHANED }
enum NotificationType    { POST_SUBMITTED  APPROVAL_ASSIGNED  CHANGES_REQUESTED
                           POST_APPROVED  POST_REJECTED  COMMENT_MENTION
                           COMMENT_ADDED  SLA_WARNING  SLA_OVERDUE  ESCALATION }
enum EmailStatus         { QUEUED  SENT  FAILED  SUPPRESSED }
enum JobStatus           { PENDING  RUNNING  SUCCEEDED  FAILED  DEAD  CANCELLED }
enum JobType             { EMAIL_SEND  DAILY_DIGEST  SLA_CHECK  SLA_ESCALATE
                           RETENTION_CLEANUP  ORPHAN_ATTACHMENT_CLEANUP
                           TEMP_FILE_CLEANUP  SESSION_CLEANUP  NOTIFICATION_FANOUT }
enum RetentionTarget     { POST  ATTACHMENT  COMMENT  NOTIFICATION  EMAIL_LOG
                           AUDIT_LOG  BACKGROUND_JOB  SESSION }
enum SettingType         { STRING  INT  BOOL  JSON  DURATION_MINUTES  TIME_OF_DAY }
```

---

## 3. Identity and access

### User

| Field                             | Type                  | Notes                                          |
| --------------------------------- | --------------------- | ---------------------------------------------- |
| id                                | uuid PK               |                                                |
| email                             | citext                | **unique**, lowercased on write                |
| displayName                       | text                  |                                                |
| firstName / lastName              | text                  |                                                |
| jobTitle                          | text?                 |                                                |
| departmentId                      | uuid? FK → Department | `ON DELETE SET NULL`                           |
| status                            | UserStatus            | default `ACTIVE`                               |
| authProvider                      | AuthProvider          |                                                |
| externalIdentityId                | text?                 | Entra stable object id (`oid`)                 |
| passwordHash                      | text?                 | Argon2id encoded string; `NULL` for `ENTRA_ID` |
| passwordUpdatedAt                 | timestamptz?          | drives password-age policy                     |
| mustChangePassword                | boolean               | default `false`                                |
| failedLoginCount                  | int                   | default 0                                      |
| lockedUntil                       | timestamptz?          |                                                |
| timezone                          | text?                 | overrides `APP_TIMEZONE` for this user         |
| lastLoginAt                       | timestamptz?          |                                                |
| createdAt / updatedAt / deletedAt | timestamptz           |                                                |

Constraints:

- `UNIQUE (email)` — the single identity key across both providers.
- `UNIQUE (authProvider, externalIdentityId)` where `externalIdentityId IS NOT NULL`
  (partial unique index).
- `CHECK (authProvider <> 'LOCAL' OR passwordHash IS NOT NULL OR status = 'PENDING')`
- `CHECK (authProvider <> 'ENTRA_ID' OR passwordHash IS NULL)` — Entra users can
  never acquire a local password.

Indexes: `(status)`, `(departmentId)`, GIN trigram on `displayName`, `email`.

### Role, Permission, RolePermission, UserRole

- `Role(id, key UNIQUE, name, description, isSystem)` — seeded `EMPLOYEE`,
  `APPROVER`, `ADMIN`; `isSystem` roles cannot be deleted, only extended.
- `Permission(id, key UNIQUE, description, category)` — seeded from the fixed
  list in [AUTHENTICATION.md](./AUTHENTICATION.md).
- `RolePermission(roleId, permissionId)` — PK `(roleId, permissionId)`.
- `UserRole(userId, roleId, grantedById, grantedAt)` — PK `(userId, roleId)`.

Adding a role later is a data operation, not a migration.

### Department

`id, key UNIQUE, name, managerId? FK→User, parentId? FK→Department, isActive,
createdAt, updatedAt, deletedAt`. Self-referencing tree for future hierarchy;
`managerId` feeds `DEPARTMENT_MANAGER` approval routing and escalation.

### Group / UserGroup

`Group(id, key UNIQUE, name, description, isApprovalGroup, isActive, …)` and
`UserGroup(userId, groupId, addedAt)` PK `(userId, groupId)`.
An approval group is a set of users any one of whom may act.

### Session

| Field                              | Notes                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| id                                 | uuid PK, also the opaque cookie value's payload                                 |
| userId                             | FK → User, `ON DELETE CASCADE`                                                  |
| tokenHash                          | SHA-256 of the session secret — the raw value is never stored                   |
| createdAt / lastSeenAt / expiresAt | absolute + idle timeout                                                         |
| revokedAt / revokedReason          | `LOGOUT`, `LOGOUT_ALL`, `ADMIN`, `USER_DISABLED`, `PASSWORD_CHANGED`, `EXPIRED` |
| ipAddress / userAgent              | truncated, for the user's own session list                                      |
| authProvider                       | which provider minted it                                                        |
| samlSessionIndex                   | for SAML single-logout correlation                                              |

Indexes: `(userId, revokedAt)`, `(expiresAt)`.

### PasswordResetToken

`id, userId, tokenHash (SHA-256), expiresAt, usedAt, requestedIp, createdAt`.
Single-use, short-lived, hashed at rest, never logged. Index `(userId)`,
`(expiresAt)`.

### LoginAttempt

`id bigint, email, userId?, successful bool, ipAddress, userAgent, reason,
createdAt`. Feeds lockout and brute-force rate limiting; retained per policy.
Index `(email, createdAt DESC)`, `(ipAddress, createdAt DESC)`.

### SamlReplayGuard

`assertionId TEXT PK, notOnOrAfter timestamptz, consumedAt`. A processed
assertion id cannot be replayed; rows are swept after `notOnOrAfter`.

---

## 4. Content

### Post (mutable header)

| Field                                     | Notes                                                  |
| ----------------------------------------- | ------------------------------------------------------ |
| id                                        | uuid PK                                                |
| reference                                 | text UNIQUE — human-facing id, e.g. `POST-2026-000412` |
| title                                     | text — mirrors the draft title for list screens        |
| creatorId                                 | FK → User                                              |
| departmentId                              | FK? → Department                                       |
| priority                                  | Priority, default `NORMAL`                             |
| status                                    | PostStatus, default `DRAFT`                            |
| currentVersionId                          | FK? → PostVersion — latest frozen version              |
| approvedVersionId                         | FK? → PostVersion — version an approver approved       |
| draftTitle                                | text? — working draft, autosaved                       |
| draftContentJson                          | jsonb? — working draft Tiptap document                 |
| draftUpdatedAt                            | timestamptz?                                           |
| approvalRouteId                           | FK? → ApprovalRule — rule that resolved the route      |
| requestedApproverId / requestedGroupId    | explicit creator selection when allowed                |
| slaPolicyId                               | FK? → SlaPolicy                                        |
| submittedAt / firstReviewedAt / decidedAt | timestamptz?                                           |
| dueAt                                     | timestamptz? — SLA deadline of the open assignment     |
| rejectionReason                           | text? — mirror of the last REJECT comment              |
| lockVersion                               | int, default 0 — optimistic locking                    |
| retentionEligibleAt / archivedAt          | timestamptz?                                           |
| createdAt / updatedAt / deletedAt         |                                                        |

Indexes: `(creatorId, status, updatedAt DESC)`, `(status, dueAt)`,
`(departmentId, status)`, `(priority, dueAt)`, GIN on `searchVector`.
A generated `searchVector tsvector` column covers `title` + current version's
plain text (maintained by trigger or on write in the service).

### PostVersion (immutable)

| Field                      | Notes                                    |
| -------------------------- | ---------------------------------------- |
| id                         | uuid PK                                  |
| postId                     | FK → Post                                |
| versionNumber              | int — `UNIQUE (postId, versionNumber)`   |
| title                      | text                                     |
| contentJson                | jsonb — Tiptap document, source of truth |
| contentHtml                | text — server-sanitized rendering        |
| contentText                | text — plain text for search and diff    |
| characterCount / wordCount | int                                      |
| createdById                | FK → User                                |
| createdAt                  | timestamptz                              |
| submittedAt                | timestamptz?                             |
| changeSummary              | text? — creator's note on what changed   |
| supersedesVersionId        | FK? → PostVersion                        |

No `updatedAt`. The application never issues `UPDATE` against this table; the
DB role is granted `INSERT`/`SELECT`/`DELETE` (delete only for retention).

### Attachment

`id, storageKey UNIQUE, originalFilename, sanitizedFilename, kind, mimeType,
extension, byteSize, checksumSha256, width?, height?, durationSeconds?,
videoCodec?, thumbnailKey?, posterKey?, status, uploadedById, createdAt,
attachedAt?, deletedAt?`.

Index `(status, createdAt)` for orphan sweeps, `(uploadedById)`,
`(checksumSha256)`.

### PostVersionAttachment

`postVersionId, attachmentId, position` — PK `(postVersionId, attachmentId)`,
index `(attachmentId)`. Ordering is explicit so attachment reordering is
persisted. An attachment referenced by **any** version is never deleted by the
orphan job.

---

## 5. Approval

### ApprovalRule

`id, name, description, isActive, priorityOrder int, departmentId?, priority?,
creatorGroupId?, targetType ApproverTargetType, targetUserId?, targetGroupId?,
slaPolicyId?, allowCreatorOverride bool, createdAt, updatedAt`.

Rules are evaluated in ascending `priorityOrder`; the first match wins; a
seeded catch-all rule guarantees a route always resolves. Routing is computed
server-side at submission — never in the frontend.

Index `(isActive, priorityOrder)`.

### ApprovalAssignment

`id, postId, postVersionId, assigneeUserId?, assigneeGroupId?, assignedById?,
status AssignmentStatus, ruleId?, dueAt?, warningAt?, assignedAt, startedAt?,
completedAt?, escalatedAt?, escalationLevel int`.

Exactly one of `assigneeUserId` / `assigneeGroupId` is set (`CHECK`).
Partial unique index: at most one `PENDING`/`IN_PROGRESS` assignment per post.
Indexes `(assigneeUserId, status, dueAt)`, `(status, warningAt)`,
`(status, dueAt)`.

The model already carries `escalationLevel` and allows several rows per post, so
multi-stage approval can be added later without a breaking migration.

### ApprovalAction (immutable, append-only)

`id, postId, postVersionId, assignmentId?, actorId, action ApprovalActionType,
comment?, previousStatus PostStatus, newStatus PostStatus, createdAt,
metadata jsonb?`.

`CHECK` enforces that `REQUEST_CHANGES` and `REJECT` carry a non-empty comment.
Every row names the exact version acted on — an approval can never be
ambiguous about what it approved.

Indexes `(postId, createdAt)`, `(actorId, createdAt DESC)`,
`(action, createdAt)`.

### SlaPolicy

`id, name, priority Priority?, departmentId?, durationMinutes int,
warningThresholdPercent int (default 75), businessHoursOnly bool (default
false), escalationAfterMinutes int?, escalationTargetType?, escalationUserId?,
escalationGroupId?, isActive, createdAt, updatedAt`.

Resolution order: department+priority → priority → global default.
`UNIQUE (departmentId, priority)` where both are non-null.

---

## 6. Collaboration and delivery

### Comment

`id, postId, postVersionId?, authorId, parentId? (self FK, one level of
replies), body text, bodyHtml (sanitized), isInternal bool, createdAt,
updatedAt, deletedAt`. Index `(postId, createdAt)`, `(parentId)`.

### CommentMention

`commentId, mentionedUserId` PK `(commentId, mentionedUserId)`. Written by the
server after parsing the comment body — the client's claimed mention list is
not trusted.

### Notification

`id, recipientId, type NotificationType, title, body, entityType, entityId,
postId?, actorId?, createdAt, readAt?, emailJobId?`.
Indexes `(recipientId, readAt, createdAt DESC)` — this one index answers the
unread badge, the list and the filters.

### NotificationPreference

`userId, type NotificationType, inAppEnabled (default true), emailEnabled
(default true), updatedAt`. `PRIMARY KEY (userId, type)`. Absence of a row
for a `(user, type)` pair means both defaults apply — `writeNotification`
and the email queue only ever need to check for an explicit `false`.

### EmailTemplate

`id, key UNIQUE, name, subjectTemplate, bodyTemplate, isHtml, locale, isActive,
updatedById?, createdAt, updatedAt`. Seeded from files on first migration;
editable in Administration.

### EmailLog

`id bigint, templateKey, toAddress, ccAddress?, subject, status EmailStatus,
attempts int, lastError?, jobId?, postId?, userId?, idempotencyKey UNIQUE?,
queuedAt, sentAt?`. Bodies are **not** stored beyond the rendered subject;
credentials never appear. Index `(status, queuedAt)`, `(toAddress, queuedAt)`.

---

## 7. Operations

### BackgroundJob

`id bigint, type JobType, payload jsonb, status JobStatus, priority int,
attempts int, maxAttempts int, scheduledAt, startedAt?, completedAt?,
lockedBy text?, lockedAt?, lastError text?, idempotencyKey text UNIQUE?,
createdAt, updatedAt`.

Claim index: `(status, scheduledAt, priority)`. Stale reclaim index:
`(status, lockedAt)`.

### JobSchedule

`id, key UNIQUE, jobType JobType, cronExpression text, timezone text,
payload jsonb?, isEnabled bool, lastEnqueuedSlot text?, lastRunAt?,
nextRunAt?, createdAt, updatedAt`. Seeded with digest, SLA check, retention,
cleanup schedules.

### RetentionPolicy

`id, target RetentionTarget UNIQUE, retentionDays int, isEnabled bool,
dryRun bool (default true), lastRunAt?, description, updatedById?, createdAt,
updatedAt`. Default post retention is seeded at **30 days** as a row — never a
constant in code.

### RetentionRun

`id bigint, target, dryRun bool, startedAt, finishedAt?, candidateCount int,
deletedCount int, skippedCount int, freedBytes bigint?, error?, details jsonb`.
Gives Administration a cleanup history.

### AuditLog (immutable, append-only)

`id bigint, actorId? (null = system), actorEmail (denormalised so history
survives user deletion), action text, entityType text, entityId text?,
postId?, ipAddress inet?, userAgent?, metadata jsonb, createdAt`.

Indexes `(createdAt DESC)`, `(entityType, entityId, createdAt DESC)`,
`(actorId, createdAt DESC)`, `(action, createdAt DESC)`.

The application role holds `INSERT, SELECT` only. Retention deletion runs under
a separate maintenance role.

### SystemSetting

`key TEXT PK, value text, type SettingType, category text, description text,
isSecret bool, updatedById?, updatedAt`. Secrets are never stored here — the
flag exists to keep an accidental one out of exports and API responses.

---

## 8. Referential integrity summary

| Relationship                          | On delete                                             |
| ------------------------------------- | ----------------------------------------------------- |
| Post → User (creator)                 | `RESTRICT` — users are disabled, not deleted          |
| Post → PostVersion (current/approved) | `SET NULL`                                            |
| PostVersion → Post                    | `CASCADE` (retention deletes the post)                |
| PostVersionAttachment → PostVersion   | `CASCADE`                                             |
| PostVersionAttachment → Attachment    | `RESTRICT`                                            |
| ApprovalAction → Post                 | `CASCADE`                                             |
| ApprovalAction → PostVersion          | `RESTRICT` — a version cannot vanish under a decision |
| Session/PasswordResetToken → User     | `CASCADE`                                             |
| AuditLog → User                       | `SET NULL` (email is denormalised)                    |

---

## 9. Migrations

- One Prisma migration per schema change, committed with the code that needs it.
- Applied migrations are never edited. A mistake is corrected by a new
  migration.
- Destructive changes ship in two steps (add + backfill, then remove) so a
  rollback of the application does not strand the database.
- `prisma migrate deploy` runs at container start-up through the entrypoint, once,
  guarded by an advisory lock so two replicas cannot race.
- Raw SQL for things Prisma cannot express (partial unique indexes, `CHECK`
  constraints, `citext`, trigram/GIN indexes, `tsvector` generation, role grants)
  lives in the migration files as explicit SQL.
- Extensions required: `citext`, `pg_trgm`, `pgcrypto` (random ids in SQL
  fallbacks). Enabled by the first migration.

---

## 10. Seed data (development)

`prisma/seed.ts` creates: permissions, the three system roles, four departments
(Marketing, Product, Engineering, Sales), an approval group, SLA policies per
priority, retention policies, email templates, job schedules, and three users —
`john.doe@example.local` (EMPLOYEE), `jane.manager@example.local` (APPROVER),
`admin@example.local` (ADMIN), all LOCAL with a development password printed by
the seed script and never committed.

The hero fixture: **"Introducing Kron PAM 4.0"** — HIGH priority, `IN_REVIEW`,
version 3 with versions 1 and 2 present, a `CHANGES_REQUESTED` action on
version 2 with a real reviewer comment, one image and one short video
attachment, an open assignment to the approver with `dueAt` six hours out and a
`waiting` age of eighteen hours. This single record is what makes the Post
Editor and Approval Review screens demo-credible.

Seed data is idempotent and never runs automatically in production.

---

## 11. References

- Prisma schema reference — https://www.prisma.io/docs/orm/prisma-schema
- Prisma Migrate — https://www.prisma.io/docs/orm/prisma-migrate
- PostgreSQL indexes — https://www.postgresql.org/docs/16/indexes.html
- PostgreSQL `citext` — https://www.postgresql.org/docs/16/citext.html
- PostgreSQL `pg_trgm` — https://www.postgresql.org/docs/16/pgtrgm.html
- PostgreSQL constraints — https://www.postgresql.org/docs/16/ddl-constraints.html
