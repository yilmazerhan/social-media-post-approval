#!/usr/bin/env bash
# DEPLOYMENT.md §8 "Upgrade" — dump the database, move to the requested
# ref, rebuild the image, and restart `app`/`worker` (migrations run at
# their start-up under Prisma's own advisory lock, so this is safe even
# if `app` and `worker` race each other). `postgres` and `nginx` are left
# alone with `--no-deps`, matching DEPLOYMENT.md's documented command.
#
# Usage (from the machine that ran scripts/install.sh, or with INSTALL_DIR
# pointed at it):
#   bash scripts/update.sh [branch-or-tag]
#
# With no argument, this fast-forwards the currently checked-out branch
# instead of switching to a different ref.
#
# Configuration (environment variables, all optional):
#   INSTALL_DIR   Where the app was cloned. Default: /opt/content-approval
#   BACKUP_DIR    Where the pre-upgrade database dump is written.
#                 Default: /backup
#   FORCE         Set to "true" to proceed with uncommitted local changes
#                 in the app directory (normally refused).

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/content-approval}"
BACKUP_DIR="${BACKUP_DIR:-/backup}"
FORCE="${FORCE:-false}"
REF="${1:-}"
APP_DIR="$INSTALL_DIR/app"

log() { echo "[update] $*"; }
fail() {
  echo "[update] FAILED: $*" >&2
  exit 1
}

[ -d "$APP_DIR/.git" ] || fail "$APP_DIR is not a git checkout — run scripts/install.sh first."
cd "$APP_DIR"
[ -f docker-compose.yml ] || fail "docker-compose.yml not found in $APP_DIR."
[ -f .env ] || fail ".env not found in $APP_DIR — was install.sh interrupted?"

docker compose version >/dev/null 2>&1 || fail "docker compose is not available (are you root, or in the docker group?)."

if [ -n "$(git status --porcelain)" ] && [ "$FORCE" != "true" ]; then
  fail "$APP_DIR has uncommitted changes — commit, stash, or set FORCE=true to proceed anyway."
fi

PREV_REF="$(git rev-parse HEAD)"
log "Current commit: $PREV_REF"

# ---- 1. Backup the database before touching anything ----------------------
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${POSTGRES_USER:?POSTGRES_USER not set in .env}"
: "${POSTGRES_DB:?POSTGRES_DB not set in .env}"

mkdir -p "$BACKUP_DIR"
DUMP_PATH="$BACKUP_DIR/pre-upgrade-$(date +%F-%H%M).sql.gz"
log "Dumping database to $DUMP_PATH..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$DUMP_PATH" \
  || fail "pg_dump failed — aborting before touching the running version."
[ -s "$DUMP_PATH" ] || fail "database dump is empty — aborting."

# ---- 2. Move to the requested ref ------------------------------------------
log "Fetching..."
git fetch --all --tags --prune

if [ -n "$REF" ]; then
  log "Checking out $REF..."
  git checkout "$REF"
else
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  [ "$BRANCH" != "HEAD" ] || fail "currently in detached HEAD with no ref given — pass a branch or tag to check out."
  log "Fast-forwarding $BRANCH..."
  git merge --ff-only "@{u}"
fi

NEW_REF="$(git rev-parse HEAD)"
if [ "$NEW_REF" = "$PREV_REF" ]; then
  log "Already at $NEW_REF — nothing to upgrade."
  exit 0
fi
log "Moving from $PREV_REF to $NEW_REF."

# ---- 3. Rebuild and restart app + worker -----------------------------------
log "Building the updated image..."
docker compose build

log "Restarting app and worker (postgres and nginx are left running)..."
docker compose up -d --no-deps app worker

# ---- 4. Verify --------------------------------------------------------------
log "Waiting for /api/ready..."
READY=false
for _ in $(seq 1 30); do
  if curl -ksS -o /dev/null -w '%{http_code}' "https://localhost/api/ready" 2>/dev/null | grep -q '^200$'; then
    READY=true
    break
  fi
  sleep 5
done

if [ "$READY" != true ]; then
  cat <<EOF >&2

[update] FAILED: /api/ready did not return 200 after upgrading to $NEW_REF.
Check: docker compose logs app worker

To roll back to the previous commit ($PREV_REF):
  git checkout $PREV_REF
  docker compose build
  docker compose up -d --no-deps app worker

The pre-upgrade database dump is at: $DUMP_PATH
EOF
  exit 1
fi

log "Done. Now running $NEW_REF. Pre-upgrade database dump: $DUMP_PATH"
