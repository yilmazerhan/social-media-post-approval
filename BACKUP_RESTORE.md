# BACKUP_RESTORE.md

A backup that has never been restored is a hypothesis. Restore drills are part
of the operational contract, not an optional extra.

---

## 1. What must be backed up

| Asset                    | Location                                                        | Why                                                                     |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| PostgreSQL database      | `ca-pgdata` volume / customer DB server                         | posts, versions, approvals, users, audit log — everything transactional |
| Uploaded files           | `STORAGE_PATH` (default `/opt/content-approval/data/uploads`)   | attachments, thumbnails, posters                                        |
| Configuration            | `.env`, `docker-compose.yml`, `nginx/`, TLS certificate and key | reproducing the deployment                                              |
| Image or source revision | git tag / saved image tar                                       | restoring a _known_ version                                             |

Database and files must be captured **together**. A database referencing files
that a restore did not bring back is a broken system; the consistency procedure
below handles it.

Not backed up: container logs (operational only), the `tmp` upload directory,
`node_modules`.

---

## 2. Backup procedure

### Database

```bash
# nightly logical dump, compressed, custom format
docker compose exec -T postgres \
  pg_dump -U ca -d content_approval -Fc \
  > /backup/db/content_approval-$(date +%F-%H%M).dump
```

`-Fc` (custom format) allows selective restore and parallel `pg_restore`. For a
customer-managed database, run `pg_dump` from a host that can reach it with a
read-capable role.

For large installations, add continuous archiving (WAL) for point-in-time
recovery — see the PostgreSQL documentation linked below. Logical dumps alone
give you last-night's state; PITR gives you last-minute's.

### Files

```bash
# incremental, preserving permissions
rsync -aH --delete \
  /opt/content-approval/data/uploads/ /backup/uploads/

# or a dated archive
tar -czf /backup/files/uploads-$(date +%F).tar.gz \
  -C /opt/content-approval/data uploads
```

Exclude `uploads/tmp` — it holds partial uploads with no database references.

### Configuration

```bash
tar -czf /backup/config/config-$(date +%F).tar.gz \
  --exclude='*.key' \
  /opt/content-approval/app/.env \
  /opt/content-approval/app/docker-compose.yml \
  /opt/content-approval/app/nginx
```

The TLS private key belongs in the organisation's secret store, not in the same
archive as everything else. `.env` contains secrets: encrypt the config backup
(`gpg --symmetric`, or the customer's backup encryption) and restrict access.

### Ordering for consistency

1. Snapshot the database first.
2. Then sync files.

Files are only ever added before their database rows are committed, so a
file-after-database ordering can leave the dump referencing an attachment the
file backup missed. Doing it in this order can leave an _extra_ file with no
row — which the orphan-cleanup job removes safely. Extra files are harmless;
missing files are not.

For a fully consistent point-in-time copy, stop the app and worker briefly
(`docker compose stop app worker`), take both, then start again. A minute of
downtime buys certainty.

---

## 3. Schedule and retention

| Backup                        | Frequency                     | Keep                      |
| ----------------------------- | ----------------------------- | ------------------------- |
| Database dump                 | nightly                       | 30 daily, 12 monthly      |
| WAL archive (if enabled)      | continuous                    | 7 days                    |
| Uploads                       | nightly incremental           | 30 days of versions       |
| Configuration                 | on every change, plus monthly | 12 months                 |
| Off-site / second medium copy | weekly                        | per the customer's policy |

Store at least one copy on separate hardware. Encrypt anything leaving the
server.

Example systemd timer (a cron entry works equally well):

```ini
# /etc/systemd/system/ca-backup.timer
[Timer]
OnCalendar=*-*-* 01:30:00
Persistent=true
[Install]
WantedBy=timers.target
```

The backup script should exit non-zero on any failure and be monitored the same
way any other job is — a silent backup failure is the most common cause of an
unrecoverable incident.

---

## 4. Restore procedure

### Full restore onto a clean host

```bash
# 1. Install prerequisites and lay down the same version
cd /opt/content-approval && git clone <url> app && cd app
git checkout v1.0.0            # the version the backup came from

# 2. Restore configuration
tar -xzf /backup/config/config-2026-09-04.tar.gz -C /
chmod 600 .env

# 3. Start only the database
docker compose up -d postgres
docker compose exec -T postgres psql -U postgres \
  -c "CREATE DATABASE content_approval OWNER ca;"

# 4. Restore the database
cat /backup/db/content_approval-2026-09-04-0130.dump | \
docker compose exec -T postgres \
  pg_restore -U ca -d content_approval --clean --if-exists --no-owner -j 4

# 5. Restore files
rsync -aH /backup/uploads/ /opt/content-approval/data/uploads/
chown -R 10001:10001 /opt/content-approval/data

# 6. Apply any migrations newer than the dump, then start
docker compose up -d app worker nginx
docker compose exec app npm run db:deploy

# 7. Verify
curl -fsS https://approval.corp.local/api/ready
```

### Database only (application intact)

Stop `app` and `worker` first so nothing writes during the restore, then run
steps 4 and 6, then start them again.

### Files only

Restore the tree, fix ownership, and run the orphan-attachment job in dry-run
mode from Administration → Background Jobs to see whether any database row lost
its file.

---

## 5. Post-restore verification

- [ ] `/api/ready` green — database, storage, worker
- [ ] Row counts sane: `SELECT count(*) FROM "Post"`, `"PostVersion"`,
      `"ApprovalAction"`, `"AuditLog"`
- [ ] Log in as a local user and as an Entra user
- [ ] Open the hero post; images and video play — that proves database↔file
      consistency in one click
- [ ] Approval history shows the correct version references
- [ ] Background jobs process (send a test email)
- [ ] Audit log continues from the restore point without a gap you cannot explain
- [ ] Retention dry run reports plausible candidates before you re-enable
      deletion

If files are missing for known attachments, the restore was file-then-database
or the file backup ran ahead of the dump. Restore the newer file backup, or
accept the loss and record it — the attachment row can be deleted through the
admin cleanup.

---

## 6. Disaster recovery

| Scenario                              | Action                                                                                 | Target                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| Application container corrupted       | Redeploy the image; data untouched                                                     | RTO < 15 min, RPO 0                          |
| Database corrupted, host alive        | Restore last dump (+ WAL if enabled)                                                   | RTO < 1 h, RPO ≤ 24 h (or minutes with PITR) |
| Upload volume lost                    | Restore from file backup                                                               | RTO < 2 h, RPO ≤ 24 h                        |
| Whole host lost                       | Full restore on a new host, §4                                                         | RTO < 4 h, RPO ≤ 24 h                        |
| Accidental mass deletion by retention | Restore database to before the run; retention's dry-run default is the primary defence | RPO ≤ 24 h                                   |

Agree RTO/RPO with the customer and set the backup frequency to match — the
table above is a starting point, not a promise made on their behalf.

**Drill quarterly**: restore the latest backup onto a scratch host, run the
verification checklist, record the elapsed time. Fix whatever the drill exposes
before it matters.

---

## 7. Operational visibility

- The dashboard's system-health tiles (visible to an admin) show storage
  usage (used/total, from the `STORAGE_PATH` filesystem) and a "Backup" tile:
  healthy within `BACKUP_STALENESS_HOURS` (default 26) of the last recorded
  run, degraded if none has ever been recorded or it's older than that, down
  if the marker itself can't be read.
- The marker is `system.backup.lastRunAt`, a `SystemSetting` row seeded
  empty by `bootstrapSystemData()` and written by the backup script itself
  through the existing `PATCH /api/v1/admin/settings/system.backup.lastRunAt`
  endpoint — no separate marker endpoint exists; this is genuinely "through
  the admin API," using the same session auth every other admin action does.
  A dedicated LOCAL account for this (not a human's login) is the intended
  setup — `BACKUP_MARKER_EMAIL`/`BACKUP_MARKER_PASSWORD` below.
- Backup jobs themselves run outside the application (cron/systemd), because a
  backup that depends on the application being healthy is not a backup.

### Scripts

`scripts/backup.sh` implements §2 above end to end (`pg_dump -Fc`, then a
files sync/archive excluding `tmp`, then the marker write) and exits non-zero
on any failure in the database or marker steps (a missing `STORAGE_PATH` is
only a warning — the same "extra files are harmless, missing ones aren't"
reasoning as the ordering note above). It reads:

| Variable                 | Required       | Purpose                                              |
| ------------------------ | -------------- | ---------------------------------------------------- |
| `DATABASE_URL`           | yes            | passed to `pg_dump` (Prisma's `?schema=` stripped)   |
| `STORAGE_PATH`           | yes            | the uploads directory to back up                     |
| `BACKUP_DIR`             | no (`/backup`) | where dumps/archives land                            |
| `APP_URL`                | no             | base URL of a running instance, for the marker step  |
| `BACKUP_MARKER_EMAIL`    | no             | a LOCAL admin account used only to record the marker |
| `BACKUP_MARKER_PASSWORD` | no             | its password                                         |

Config (`.env`, `docker-compose.yml`, `nginx/`) isn't handled by this script —
its exact layout varies per deployment and needs its own encryption step; see
§2's manual `tar`/`gpg` commands above.

`scripts/restore-drill.sh` performs §4's database (and, optionally, files)
restore against a throwaway database you create first, runs
`prisma migrate deploy` against it, and prints the row counts from §5's
checklist — this **is** the quarterly drill script §6 asks for, not a
separate procedure. It reports elapsed time and reminds you which checklist
items still need a running app pointed at the restored database (login,
opening the hero post, background jobs, the retention dry run).

Both scripts were run for real against this repository's own dev database as
part of building this section: a backup, a restore onto a scratch database,
and a live marker round-trip through a running dev server all completed
successfully, with post-restore row counts matching the source database
exactly. See IMPLEMENTATION_PLAN.md's Phase 24 retrospective for the numbers.

---

## 8. References

- PostgreSQL backup and restore — https://www.postgresql.org/docs/16/backup.html
- `pg_dump` — https://www.postgresql.org/docs/16/app-pgdump.html
- `pg_restore` — https://www.postgresql.org/docs/16/app-pgrestore.html
- Continuous archiving / PITR — https://www.postgresql.org/docs/16/continuous-archiving.html
- rsync — https://download.samba.org/pub/rsync/rsync.1
- Docker volume backup — https://docs.docker.com/engine/storage/volumes/#back-up-restore-or-migrate-data-volumes
