# CONFIGURATION.md

Two kinds of configuration:

- **Environment variables** — infrastructure and secrets. Read once at start-up,
  validated by a Zod schema in `src/server/config.ts`. A missing or malformed
  mandatory value stops the process with a readable list of problems. Nothing
  else in the codebase touches `process.env`.
- **`SystemSetting` rows** — operational policy an administrator changes at
  runtime through the Administration UI, with no restart and no redeploy.

`.env.example` in the repository root lists every variable with a safe
placeholder. `.env` is git-ignored and must never be committed.

Any variable may instead be supplied as `<NAME>_FILE` pointing at a file, so
Docker/Podman secrets work without putting values in the environment.

---

## 1. Application

| Variable           | Required | Default            | Notes                                                                                                          |
| ------------------ | :------: | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         |    ✓     | `production`       | `development` \| `test` \| `production`                                                                        |
| `APP_NAME`         |          | `Content Approval` | shown in the shell and emails                                                                                  |
| `APP_URL`          |    ✓     | —                  | external base URL, e.g. `https://approval.corp.local`. Used for links, CSRF origin checks and the SAML ACS URL |
| `PORT`             |          | `3000`             | app listen port                                                                                                |
| `APP_TIMEZONE`     |          | `Europe/Istanbul`  | display timezone default; storage is always UTC                                                                |
| `LOG_LEVEL`        |          | `info`             | `trace`…`fatal`                                                                                                |
| `LOG_FORMAT`       |          | `json`             | `json` \| `pretty` (development only)                                                                          |
| `TRUST_PROXY`      |          | `true`             | trust `X-Forwarded-*` from Nginx                                                                               |
| `TRUST_PROXY_HOPS` |          | `1`                | how many proxies sit in front                                                                                  |

## 2. Database

| Variable                        | Required | Default | Notes                                                             |
| ------------------------------- | :------: | ------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                  |    ✓     | —       | `postgresql://user:pass@host:5432/content_approval?schema=public` |
| `DATABASE_POOL_SIZE`            |          | `10`    | per process; the worker uses its own pool                         |
| `DATABASE_CONNECT_TIMEOUT`      |          | `10`    | seconds                                                           |
| `DATABASE_STATEMENT_TIMEOUT_MS` |          | `15000` | server-side guard                                                 |
| `DATABASE_SSL`                  |          | `false` | `true` for a TLS-protected customer database                      |
| `DATABASE_SSL_CA_FILE`          |          | —       | CA bundle path when `DATABASE_SSL=true`                           |

## 3. Security and session

| Variable                                                        | Required | Default                      | Notes                                                  |
| --------------------------------------------------------------- | :------: | ---------------------------- | ------------------------------------------------------ |
| `SESSION_SECRET`                                                |    ✓     | —                            | ≥32 random bytes; rotating it invalidates all sessions |
| `SESSION_COOKIE_NAME`                                           |          | `ca_session`                 |                                                        |
| `SESSION_ABSOLUTE_TIMEOUT_MINUTES`                              |          | `480`                        |                                                        |
| `SESSION_IDLE_TIMEOUT_MINUTES`                                  |          | `60`                         |                                                        |
| `SESSION_REVOKE_ON_ROLE_CHANGE`                                 |          | `false`                      |                                                        |
| `COOKIE_SECURE`                                                 |          | `true` in production         | forced `true` when `APP_URL` is https                  |
| `CSRF_COOKIE_NAME`                                              |          | `ca_csrf`                    |                                                        |
| `RATE_LIMIT_AUTH_MAX` / `_WINDOW_MINUTES`                       |          | `10` / `15`                  |                                                        |
| `RATE_LIMIT_MUTATION_MAX`                                       |          | `120` per minute             |                                                        |
| `LOCKOUT_THRESHOLD`                                             |          | `5`                          | failed logins                                          |
| `LOCKOUT_DURATION_MINUTES`                                      |          | `15`                         |                                                        |
| `PASSWORD_MIN_LENGTH`                                           |          | `12`                         |                                                        |
| `PASSWORD_REQUIRE_UPPER` / `_LOWER` / `_DIGIT` / `_SYMBOL`      |          | `true`/`true`/`true`/`false` |                                                        |
| `PASSWORD_HISTORY_COUNT`                                        |          | `5`                          |                                                        |
| `PASSWORD_MAX_AGE_DAYS`                                         |          | `0`                          | 0 disables expiry                                      |
| `PASSWORD_RESET_TTL_MINUTES`                                    |          | `60`                         |                                                        |
| `ARGON2_MEMORY_KIB` / `ARGON2_TIME_COST` / `ARGON2_PARALLELISM` |          | `19456` / `2` / `1`          | OWASP baseline                                         |

## 4. Authentication providers

| Variable                                                                                                                     | Required  | Default                           | Notes                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | :-------: | --------------------------------- | ------------------------------------------------------- |
| `AUTH_LOCAL_ENABLED`                                                                                                         |           | `true`                            |                                                         |
| `AUTH_SAML_ENABLED`                                                                                                          |           | `false`                           | when `true`, every `SAML_*` below is mandatory          |
| `SAML_ENTITY_ID`                                                                                                             | ✓ if SAML | —                                 | SP entity id, e.g. `https://approval.corp.local/saml`   |
| `SAML_ACS_URL`                                                                                                               | ✓ if SAML | `${APP_URL}/api/v1/auth/saml/acs` | must match Entra exactly                                |
| `SAML_IDP_ENTITY_ID`                                                                                                         | ✓ if SAML | —                                 | Entra identifier                                        |
| `SAML_IDP_SSO_URL`                                                                                                           | ✓ if SAML | —                                 | Entra login endpoint                                    |
| `SAML_IDP_SLO_URL`                                                                                                           |           | —                                 | single logout                                           |
| `SAML_IDP_CERTIFICATE` / `_FILE`                                                                                             | ✓ if SAML | —                                 | PEM signing certificate; supports multiple for rollover |
| `SAML_IDP_METADATA_FILE`                                                                                                     |           | —                                 | alternative to the fields above                         |
| `SAML_SP_PRIVATE_KEY_FILE`                                                                                                   |           | —                                 | needed for signed requests / encrypted assertions       |
| `SAML_SP_CERTIFICATE_FILE`                                                                                                   |           | —                                 | published in SP metadata                                |
| `SAML_WANT_ASSERTIONS_SIGNED`                                                                                                |           | `true`                            |                                                         |
| `SAML_WANT_RESPONSE_SIGNED`                                                                                                  |           | `true`                            |                                                         |
| `SAML_SIGNATURE_ALGORITHM`                                                                                                   |           | `sha256`                          | SHA-1 is refused                                        |
| `SAML_CLOCK_SKEW_SECONDS`                                                                                                    |           | `60`                              |                                                         |
| `SAML_JIT_PROVISIONING`                                                                                                      |           | `true`                            | create users on first login                             |
| `SAML_JIT_DEFAULT_ROLE`                                                                                                      |           | `EMPLOYEE`                        |                                                         |
| `SAML_JIT_FORBID_ADMIN`                                                                                                      |           | `true`                            | group mapping may never grant ADMIN                     |
| `SAML_ALLOW_LOCAL_LINK`                                                                                                      |           | `false`                           | linking an Entra login to an existing LOCAL account     |
| `SAML_ATTR_EMAIL` / `_FIRST_NAME` / `_LAST_NAME` / `_DISPLAY_NAME` / `_OBJECT_ID` / `_GROUPS` / `_DEPARTMENT` / `_JOB_TITLE` |           | standard Microsoft claim URIs     | attribute mapping                                       |

## 5. SMTP / email

| Variable                          | Required | Default    | Notes                                                                |
| --------------------------------- | :------: | ---------- | -------------------------------------------------------------------- |
| `SMTP_HOST`                       |    ✓     | —          |                                                                      |
| `SMTP_PORT`                       |          | `587`      |                                                                      |
| `SMTP_USERNAME` / `SMTP_PASSWORD` |          | —          | omit for an unauthenticated relay                                    |
| `SMTP_FROM`                       |    ✓     | —          | e.g. `Content Approval <no-reply@corp.local>`                        |
| `SMTP_REPLY_TO`                   |          | —          |                                                                      |
| `SMTP_TLS`                        |          | `starttls` | `none` \| `starttls` \| `tls`                                        |
| `SMTP_TLS_REJECT_UNAUTHORIZED`    |          | `true`     | set `false` only for an internal self-signed relay, and document why |
| `SMTP_TIMEOUT_MS`                 |          | `15000`    |                                                                      |
| `EMAIL_ENABLED`                   |          | `true`     | `false` logs instead of sending (useful in staging)                  |
| `EMAIL_MAX_ATTEMPTS`              |          | `5`        |                                                                      |
| `EMAIL_RETRY_BASE_SECONDS`        |          | `60`       | exponential backoff base                                             |

## 6. Storage and media

| Variable                       | Required | Default                                     | Notes                                |
| ------------------------------ | :------: | ------------------------------------------- | ------------------------------------ |
| `STORAGE_PATH`                 |    ✓     | `/opt/content-approval/data/uploads`        | must be writable by the runtime user |
| `STORAGE_TMP_PATH`             |          | `${STORAGE_PATH}/tmp`                       |                                      |
| `MAX_UPLOAD_SIZE`              |          | `104857600` (100 MB)                        | per file, enforced while streaming   |
| `MAX_IMAGE_SIZE`               |          | `10485760` (10 MB)                          |                                      |
| `MAX_ATTACHMENTS_PER_POST`     |          | `10`                                        |                                      |
| `ALLOWED_IMAGE_TYPES`          |          | `image/jpeg,image/png,image/webp,image/gif` | SVG is never allowed                 |
| `ALLOWED_VIDEO_TYPES`          |          | `video/mp4,video/webm,video/quicktime`      |                                      |
| `THUMBNAIL_WIDTH`              |          | `480`                                       |                                      |
| `FFMPEG_PATH` / `FFPROBE_PATH` |          | `/usr/bin/ffmpeg`, `/usr/bin/ffprobe`       |                                      |
| `UPLOAD_TMP_TTL_MINUTES`       |          | `240`                                       | temp sweep age                       |

## 7. Worker and jobs

| Variable                   | Required | Default  | Notes                                                        |
| -------------------------- | :------: | -------- | ------------------------------------------------------------ |
| `WORKER_ENABLED`           |          | `true`   | set `false` in the web container when a separate worker runs |
| `WORKER_CONCURRENCY`       |          | `4`      |                                                              |
| `WORKER_POLL_INTERVAL_MS`  |          | `2000`   |                                                              |
| `WORKER_ID`                |          | hostname | recorded in `lockedBy`                                       |
| `JOB_STALE_AFTER_SECONDS`  |          | `900`    | reclaim jobs from a dead worker                              |
| `JOB_DEFAULT_MAX_ATTEMPTS` |          | `5`      |                                                              |
| `SCHEDULER_ENABLED`        |          | `true`   | `false` when using OS cron instead                           |
| `SCHEDULER_TICK_SECONDS`   |          | `30`     |                                                              |

## 8. Workflow defaults (bootstrap values for `SystemSetting`)

These seed the database on first run; afterwards the database row wins and the
environment variable is ignored.

| Variable                      | Default | Setting key                   |
| ----------------------------- | ------- | ----------------------------- |
| `SLA_DEFAULT_MINUTES`         | `1440`  | `sla.default.minutes`         |
| `SLA_WARNING_PERCENT`         | `75`    | `sla.warning.percent`         |
| `SLA_ESCALATION_MINUTES`      | `2880`  | `sla.escalation.minutes`      |
| `DIGEST_HOUR`                 | `9`     | `digest.hour`                 |
| `DIGEST_ENABLED`              | `true`  | `digest.enabled`              |
| `RETENTION_DAYS`              | `30`    | `retention.post.days`         |
| `RETENTION_ATTACHMENT_DAYS`   | `30`    | `retention.attachment.days`   |
| `RETENTION_NOTIFICATION_DAYS` | `90`    | `retention.notification.days` |
| `RETENTION_EMAIL_LOG_DAYS`    | `180`   | `retention.emailLog.days`     |
| `RETENTION_AUDIT_LOG_DAYS`    | `730`   | `retention.auditLog.days`     |
| `RETENTION_JOB_DAYS`          | `30`    | `retention.job.days`          |
| `RETENTION_DRY_RUN`           | `true`  | `retention.dryRun`            |
| `POST_MAX_CHARACTERS`         | `2200`  | `post.maxCharacters`          |
| `AUTOSAVE_INTERVAL_SECONDS`   | `3`     | `editor.autosaveSeconds`      |
| `COMMENT_MAX_CHARACTERS`      | `2000`  | `comment.maxCharacters`       |
| `COMMENT_EDIT_WINDOW_MINUTES` | `30`    | `comment.editWindowMinutes`   |

Retention defaults to **dry run**. An administrator enables real deletion
deliberately, after reviewing what a dry run reports.

---

## 9. Runtime settings (Administration → System Settings)

Editable without restart, with an audit entry per change:

- SLA policies per priority and department, warning threshold, escalation target
- Digest hour, digest enable/disable, timezone
- Retention windows per entity, dry-run flag
- Email templates (subject and body), sender display name, notification
  preferences defaults
- Approval rules and routing, allow-creator-override
- Session timeouts (within the bounds the environment permits)
- Post character limit, attachment count limit
- Feature toggles for optional screens

Values are typed (`SettingType`), validated with Zod on write, cached in-process
with invalidation on update, and never used to hold secrets.

---

## 10. Start-up validation

At boot the application:

1. Parses and validates the environment; prints every problem at once, then
   exits `1` on failure.
2. Refuses to start in production with a default or example `SESSION_SECRET`,
   with `COOKIE_SECURE=false` behind an https `APP_URL`, or with
   `SMTP_TLS_REJECT_UNAUTHORIZED=false` unless `ALLOW_INSECURE_SMTP=true` is
   also set explicitly.
3. Verifies database connectivity and that migrations are applied.
4. Verifies `STORAGE_PATH` exists and is writable.
5. Verifies FFmpeg/FFprobe are present when video uploads are enabled.
6. Logs a redacted configuration summary — never a secret value.

Fail fast, loudly, at start-up; never half-work at request time.

---

## 11. References

- Twelve-Factor App — Config — https://12factor.net/config
- Next.js environment variables — https://nextjs.org/docs/app/building-your-application/configuring/environment-variables
- Docker secrets — https://docs.docker.com/engine/swarm/secrets/
- Podman secrets — https://docs.podman.io/en/latest/markdown/podman-secret.1.html
- Prisma connection URLs — https://www.prisma.io/docs/orm/reference/connection-urls
