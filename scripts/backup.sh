#!/usr/bin/env bash
# BACKUP_RESTORE.md §2-3, §7. Runs outside the app (cron/systemd) — a
# backup that depends on the application being healthy is not a backup.
# Order matters: the database is dumped first, then files, so a file
# added just after the dump (but not yet referenced by a committed row)
# never leaves the database pointing at something missing (BACKUP_RESTORE.md
# §2, "Ordering for consistency").
#
# Required environment:
#   DATABASE_URL        postgresql://user:pass@host:port/dbname
#   STORAGE_PATH         uploads directory (attachments, thumbnails)
#   BACKUP_DIR           where dumps/archives are written (default /backup)
#
# Optional, for the marker step (BACKUP_RESTORE.md §7 — "Administration ->
# System Health shows ... the timestamp of the last recorded backup"):
#   APP_URL               base URL of a running instance (e.g. https://approval.corp.local)
#   BACKUP_MARKER_EMAIL    a LOCAL admin account used only to record the marker
#   BACKUP_MARKER_PASSWORD
# The marker step is skipped (with a warning, not a failure) if these three
# are unset -- a backup that succeeded but couldn't be recorded is still a
# successful backup.
#
# Config (docker-compose.yml, nginx/, .env) is deliberately not handled
# here: its exact file layout varies per deployment (see BACKUP_RESTORE.md
# §2's own version, which assumes a specific docker-compose tree) and it
# needs its own encryption step the operator chooses, not this script.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${STORAGE_PATH:?STORAGE_PATH is required}"
BACKUP_DIR="${BACKUP_DIR:-/backup}"
TIMESTAMP="$(date +%F-%H%M)"

log() { echo "[backup] $*"; }
fail() {
  echo "[backup] FAILED: $*" >&2
  exit 1
}

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"

# CONFIGURATION.md's DATABASE_URL carries Prisma's own `?schema=` query
# parameter, which libpq (pg_dump/psql/pg_restore) doesn't recognize —
# strip it, keeping any other query parameters (sslmode, etc.) intact.
PG_DATABASE_URL="$(echo "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

# ---- 1. Database (must succeed) --------------------------------------
DB_DUMP_PATH="$BACKUP_DIR/db/content_approval-$TIMESTAMP.dump"
log "Dumping database to $DB_DUMP_PATH"
pg_dump "$PG_DATABASE_URL" -Fc -f "$DB_DUMP_PATH" \
  || fail "pg_dump failed"
[ -s "$DB_DUMP_PATH" ] || fail "database dump is empty"

# ---- 2. Files (must succeed if STORAGE_PATH exists) -------------------
if [ -d "$STORAGE_PATH" ]; then
  if command -v rsync >/dev/null 2>&1; then
    log "Syncing $STORAGE_PATH to $BACKUP_DIR/uploads (rsync, excluding tmp/)"
    rsync -aH --delete --exclude 'tmp' "$STORAGE_PATH/" "$BACKUP_DIR/uploads/" \
      || fail "rsync of uploads failed"
  else
    FILES_ARCHIVE="$BACKUP_DIR/uploads/uploads-$TIMESTAMP.tar.gz"
    log "rsync not found; archiving $STORAGE_PATH to $FILES_ARCHIVE (excluding tmp/)"
    tar -czf "$FILES_ARCHIVE" --exclude='tmp' -C "$(dirname "$STORAGE_PATH")" "$(basename "$STORAGE_PATH")" \
      || fail "tar of uploads failed"
  fi
else
  log "WARNING: STORAGE_PATH ($STORAGE_PATH) does not exist yet — skipping file backup."
fi

# ---- 3. Marker (best-effort) -------------------------------------------
if [ -n "${APP_URL:-}" ] && [ -n "${BACKUP_MARKER_EMAIL:-}" ] && [ -n "${BACKUP_MARKER_PASSWORD:-}" ]; then
  COOKIE_JAR="$(mktemp)"
  trap 'rm -f "$COOKIE_JAR"' EXIT

  log "Recording backup marker via $APP_URL"
  LOGIN_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' \
    -c "$COOKIE_JAR" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$BACKUP_MARKER_EMAIL\",\"password\":\"$BACKUP_MARKER_PASSWORD\"}" \
    "$APP_URL/api/v1/auth/login")
  if [ "$LOGIN_STATUS" != "200" ]; then
    log "WARNING: marker login failed (HTTP $LOGIN_STATUS) — backup itself succeeded, marker not recorded."
  else
    CSRF_TOKEN=$(grep -i 'ca_csrf' "$COOKIE_JAR" | awk '{print $NF}')
    NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
    MARKER_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' \
      -b "$COOKIE_JAR" \
      -H 'Content-Type: application/json' \
      -H "X-CSRF-Token: $CSRF_TOKEN" \
      -X PATCH \
      -d "{\"value\":\"$NOW_ISO\"}" \
      "$APP_URL/api/v1/admin/settings/system.backup.lastRunAt")
    if [ "$MARKER_STATUS" != "200" ]; then
      log "WARNING: marker write failed (HTTP $MARKER_STATUS) — backup itself succeeded, marker not recorded."
    else
      log "Marker recorded: $NOW_ISO"
    fi
  fi
else
  log "APP_URL/BACKUP_MARKER_EMAIL/BACKUP_MARKER_PASSWORD not all set — skipping marker step."
fi

log "Backup complete: $DB_DUMP_PATH"
