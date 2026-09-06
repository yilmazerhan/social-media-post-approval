#!/usr/bin/env bash
# BACKUP_RESTORE.md §4 ("Full restore onto a clean host") and §6 ("Drill
# quarterly: restore the latest backup onto a scratch host, run the
# verification checklist, record the elapsed time"). This script IS the
# drill: point it at a real dump (and optionally a files backup) and a
# throwaway database name, and it performs a genuine restore plus the
# DB-verifiable half of BACKUP_RESTORE.md §5's checklist.
#
# Required environment:
#   DUMP_PATH             path to a pg_dump -Fc file (from scripts/backup.sh)
#   RESTORE_DATABASE_URL  postgresql://.../<a throwaway database, already created>
#
# Optional:
#   UPLOADS_BACKUP_PATH   a files backup directory to restore alongside the DB
#   RESTORE_UPLOADS_PATH  where to restore it to (required if UPLOADS_BACKUP_PATH is set)
#
# This does not create the throwaway database itself (creating a database
# needs superuser/CREATEDB rights this script has no business assuming) —
# create it first, e.g.:
#   psql "$ADMIN_DATABASE_URL" -c 'CREATE DATABASE content_approval_restore_drill;'

set -euo pipefail

: "${DUMP_PATH:?DUMP_PATH is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
[ -s "$DUMP_PATH" ] || {
  echo "[restore-drill] FAILED: $DUMP_PATH is missing or empty" >&2
  exit 1
}

START_EPOCH=$(date +%s)
log() { echo "[restore-drill] $*"; }
fail() {
  echo "[restore-drill] FAILED: $*" >&2
  exit 1
}

# Prisma's own `?schema=` query parameter isn't a libpq parameter — strip
# it for pg_restore/psql, keep RESTORE_DATABASE_URL (with `?schema=`, if
# present) for `prisma migrate deploy` below, which expects it.
PG_RESTORE_DATABASE_URL="$(echo "$RESTORE_DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

log "Restoring $DUMP_PATH into the target database"
pg_restore --clean --if-exists --no-owner -j 4 \
  -d "$PG_RESTORE_DATABASE_URL" "$DUMP_PATH" \
  || fail "pg_restore reported an error"

if [ -n "${UPLOADS_BACKUP_PATH:-}" ]; then
  : "${RESTORE_UPLOADS_PATH:?RESTORE_UPLOADS_PATH is required when UPLOADS_BACKUP_PATH is set}"
  log "Restoring files from $UPLOADS_BACKUP_PATH to $RESTORE_UPLOADS_PATH"
  mkdir -p "$RESTORE_UPLOADS_PATH"
  if command -v rsync >/dev/null 2>&1; then
    rsync -aH "$UPLOADS_BACKUP_PATH/" "$RESTORE_UPLOADS_PATH/" || fail "rsync of uploads failed"
  else
    tar -xzf "$UPLOADS_BACKUP_PATH" -C "$RESTORE_UPLOADS_PATH" || fail "tar extraction of uploads failed"
  fi
fi

log "Applying any migrations newer than the dump"
DATABASE_URL="$RESTORE_DATABASE_URL" npx prisma migrate deploy \
  || fail "prisma migrate deploy failed against the restored database"

log "Post-restore row counts (BACKUP_RESTORE.md §5):"
psql "$PG_RESTORE_DATABASE_URL" -t -A -F' = ' -c "
  SELECT 'Post', count(*) FROM \"Post\"
  UNION ALL SELECT 'PostVersion', count(*) FROM \"PostVersion\"
  UNION ALL SELECT 'ApprovalAction', count(*) FROM \"ApprovalAction\"
  UNION ALL SELECT 'AuditLog', count(*) FROM \"AuditLog\";
" || fail "row-count verification query failed"

ELAPSED=$(( $(date +%s) - START_EPOCH ))
log "Drill complete in ${ELAPSED}s."
log "Remaining checklist items (BACKUP_RESTORE.md §5) need a running app pointed at this database:"
log "  - log in as a local user and as an Entra user"
log "  - open the hero post; images/video play"
log "  - approval history shows correct version references"
log "  - background jobs process (send a test email)"
log "  - audit log continues from the restore point without an unexplained gap"
log "  - retention dry run reports plausible candidates before re-enabling deletion"
