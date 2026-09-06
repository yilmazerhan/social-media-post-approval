#!/usr/bin/env bash
# DEPLOYMENT.md §1-4, §6, §10-11 — automates the Docker Compose install
# walkthrough on a fresh Ubuntu 24.04 (also works on 22.04) host: installs
# Docker Engine + the Compose plugin from Docker's own apt repo, clones
# this repository, generates .env (session secret, database password), a
# placeholder TLS certificate, the uploads volume, then brings the stack
# up and runs the database migration + bootstrap steps.
#
# This is the container path (DEPLOYMENT.md §4), not the non-container
# systemd install (§9) — this project's Dockerfile/docker-compose.yml/
# docker-entrypoint.sh are built around it and it's what DEPLOYMENT.md
# documents in the most detail.
#
# Usage (as root, or via sudo):
#   sudo bash scripts/install.sh
#
# Configuration (environment variables, all optional):
#   INSTALL_DIR   Where the app is cloned. Default: /opt/content-approval
#   REPO_URL      Git URL to clone. Default: this project's GitHub repo
#   REPO_REF      Branch or tag to check out. Default: repo's default branch
#   APP_DOMAIN    Public hostname for APP_URL and the placeholder cert's CN.
#                 Default: approval.corp.local
#   CERT_FILE     Path to a real TLS certificate (fullchain) to install
#                 instead of generating a self-signed placeholder.
#   KEY_FILE      Path to that certificate's private key. Required together
#                 with CERT_FILE.
#   SKIP_OS_CHECK Set to "true" to proceed on an OS other than Ubuntu 22.04/
#                 24.04 (untested, not supported by DEPLOYMENT.md §1).
#
# Re-running this script is safe: each step is skipped when its result is
# already in place (Docker installed, .env present, certs present, repo
# cloned). To pull in a newer version of the app itself, use
# scripts/update.sh instead — this script does not do that.

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/content-approval}"
REPO_URL="${REPO_URL:-https://github.com/yilmazerhan/social-media-post-approval.git}"
REPO_REF="${REPO_REF:-}"
APP_DOMAIN="${APP_DOMAIN:-approval.corp.local}"
CERT_FILE="${CERT_FILE:-}"
KEY_FILE="${KEY_FILE:-}"
SKIP_OS_CHECK="${SKIP_OS_CHECK:-false}"
APP_DIR="$INSTALL_DIR/app"

log() { echo "[install] $*"; }
fail() {
  echo "[install] FAILED: $*" >&2
  exit 1
}

# ---- 0. Preflight ------------------------------------------------------
[ "$(id -u)" -eq 0 ] || fail "must be run as root (try: sudo bash scripts/install.sh)"

if [ -r /etc/os-release ]; then
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ] || { [ "${VERSION_ID:-}" != "24.04" ] && [ "${VERSION_ID:-}" != "22.04" ]; }; then
    if [ "$SKIP_OS_CHECK" != "true" ]; then
      fail "unsupported OS: ${PRETTY_NAME:-unknown} (DEPLOYMENT.md §1 supports Ubuntu 22.04/24.04 here). Set SKIP_OS_CHECK=true to proceed anyway."
    fi
    log "WARNING: unsupported OS (${PRETTY_NAME:-unknown}), continuing because SKIP_OS_CHECK=true."
  fi
else
  fail "/etc/os-release not found — cannot confirm this is Ubuntu."
fi

if [ -n "$KEY_FILE" ] && [ -z "$CERT_FILE" ]; then fail "KEY_FILE given without CERT_FILE."; fi
if [ -n "$CERT_FILE" ] && [ -z "$KEY_FILE" ]; then fail "CERT_FILE given without KEY_FILE."; fi

log "Installing to $APP_DIR (domain: $APP_DOMAIN)"

# ---- 1. Prerequisite packages -------------------------------------------
log "Installing prerequisite packages..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git openssl >/dev/null

# ---- 2. Docker Engine + Compose plugin ----------------------------------
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  log "Docker + Compose plugin already installed, skipping."
else
  log "Installing Docker Engine and the Compose plugin (docs.docker.com/engine/install/ubuntu)..."
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  ARCH="$(dpkg --print-architecture)"
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  systemctl enable --now docker
fi

# Let whoever invoked sudo run `docker compose` afterwards without sudo.
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  usermod -aG docker "$SUDO_USER" \
    && log "Added $SUDO_USER to the docker group (log out/in for it to take effect)."
fi

# ---- 3. Fetch the application -------------------------------------------
mkdir -p "$INSTALL_DIR"
if [ -d "$APP_DIR/.git" ]; then
  log "$APP_DIR already exists, leaving it as-is (use scripts/update.sh to upgrade it)."
else
  log "Cloning $REPO_URL into $APP_DIR..."
  if [ -n "$REPO_REF" ]; then
    git clone --branch "$REPO_REF" "$REPO_URL" "$APP_DIR"
  else
    git clone "$REPO_URL" "$APP_DIR"
  fi
fi
cd "$APP_DIR"

# ---- 4. .env -------------------------------------------------------------
if [ -f .env ]; then
  log ".env already exists, leaving it untouched."
else
  log "Generating .env from .env.example..."
  cp .env.example .env
  chmod 600 .env

  SESSION_SECRET="$(openssl rand -base64 48)"
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"

  # -i.bak rather than a bare -i: GNU and BSD sed disagree on -i's syntax,
  # but both accept an explicit backup suffix the same way.
  sed -i.bak \
    -e "s#^SESSION_SECRET=.*#SESSION_SECRET=${SESSION_SECRET}#" \
    -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${POSTGRES_PASSWORD}#" \
    -e "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://ca:${POSTGRES_PASSWORD}@postgres:5432/content_approval?schema=public#" \
    -e "s#^APP_URL=.*#APP_URL=https://${APP_DOMAIN}#" \
    -e "s#^NODE_ENV=.*#NODE_ENV=production#" \
    -e "s#^LOG_FORMAT=.*#LOG_FORMAT=json#" \
    .env
  rm -f .env.bak

  log "Generated SESSION_SECRET and a database password into .env."
  log "IMPORTANT: edit .env now for SMTP_*, and AUTH_SAML_* if SSO is in scope — see CONFIGURATION.md."
fi

# ---- 5. TLS material ------------------------------------------------------
mkdir -p certs
if [ -f certs/server.crt ] && [ -f certs/server.key ]; then
  log "certs/server.crt and certs/server.key already present, leaving them untouched."
elif [ -n "$CERT_FILE" ]; then
  log "Installing provided certificate from $CERT_FILE / $KEY_FILE..."
  cp "$CERT_FILE" certs/server.crt
  cp "$KEY_FILE" certs/server.key
  chmod 600 certs/server.key
else
  log "No certificate provided — generating a self-signed placeholder for $APP_DOMAIN."
  log "WARNING: this placeholder is NOT for production use. Replace certs/server.crt"
  log "and certs/server.key with a customer-issued certificate before go-live (DEPLOYMENT.md §6)."
  openssl req -x509 -nodes -newkey rsa:2048 -days 90 \
    -keyout certs/server.key -out certs/server.crt \
    -subj "/CN=${APP_DOMAIN}" \
    -addext "subjectAltName=DNS:${APP_DOMAIN}" 2>/dev/null
  chmod 600 certs/server.key
fi

# ---- 6. Storage volume ----------------------------------------------------
log "Preparing the uploads volume..."
mkdir -p data/uploads
chown -R 10001:10001 data

# ---- 7. Bring the stack up -------------------------------------------------
log "Building images and starting the stack (this can take a few minutes on first run)..."
docker compose build
docker compose up -d

log "Waiting for the app to become healthy..."
READY=false
for _ in $(seq 1 30); do
  if curl -ksS -o /dev/null -w '%{http_code}' "https://localhost/api/health" 2>/dev/null | grep -q '^200$'; then
    READY=true
    break
  fi
  sleep 5
done
[ "$READY" = true ] || fail "app did not become healthy in time — check: docker compose logs app"

# ---- 8. Migrate + bootstrap -------------------------------------------------
# The entrypoint already runs `prisma migrate deploy` on container start
# (docker-entrypoint.sh), so this is a belt-and-suspenders no-op — kept
# for parity with DEPLOYMENT.md §4's documented step order.
log "Applying database migrations..."
docker compose exec -T app npm run db:deploy

log "Running db:bootstrap to create the first ADMIN account (interactive)..."
log "This refuses to run twice, so a re-run of install.sh will just report that and continue."
docker compose exec app npm run db:bootstrap || log "db:bootstrap did not complete — see output above (already bootstrapped, or a real failure to investigate)."

# ---- 9. Verify -----------------------------------------------------------
HEALTH_CODE=$(curl -ksS -o /dev/null -w '%{http_code}' "https://localhost/api/health" || echo "000")
READY_CODE=$(curl -ksS -o /dev/null -w '%{http_code}' "https://localhost/api/ready" || echo "000")
log "GET /api/health -> $HEALTH_CODE, GET /api/ready -> $READY_CODE"

cat <<EOF

[install] Done.

  App:        https://${APP_DOMAIN}  (self-signed cert unless you supplied CERT_FILE/KEY_FILE)
  Directory:  $APP_DIR
  Env file:   $APP_DIR/.env  (chmod 600, not tracked by git)
  Certs:      $APP_DIR/certs/

Before going live, work through DEPLOYMENT.md §11's checklist, in particular:
  - Replace the placeholder TLS certificate with a customer-issued one.
  - Edit .env: SMTP_*, and AUTH_SAML_*/SAML_* if SSO is in scope.
  - Schedule backups (scripts/backup.sh, BACKUP_RESTORE.md) and test a restore.
  - Configure log rotation for the containers' JSON stdout logs.

To upgrade later, use: scripts/update.sh
EOF
