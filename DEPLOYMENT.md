# DEPLOYMENT.md

On-premise installation on a customer-controlled Linux server. No cloud account,
no Internet requirement at runtime, no Kubernetes.

---

## 1. Supported environments

| Component                       | Supported                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| OS                              | RHEL 8/9, Rocky/Alma 8/9, Ubuntu 22.04/24.04 LTS, Debian 12                             |
| Container runtime               | Docker 24+ with Compose v2, **or** Podman 4.4+ with podman-compose / `podman kube play` |
| Database                        | PostgreSQL 16+ (containerised or customer-managed)                                      |
| Reverse proxy                   | Nginx 1.24+ (containerised or host-installed)                                           |
| Node.js (non-container install) | 22 LTS                                                                                  |

Sizing for a typical department (≈200 users, ≈100 posts/month):

| Resource       | Minimum | Recommended                |
| -------------- | ------- | -------------------------- |
| vCPU           | 2       | 4                          |
| RAM            | 4 GB    | 8 GB                       |
| Disk (system)  | 20 GB   | 40 GB                      |
| Disk (uploads) | 50 GB   | 200 GB+, on its own volume |

Uploads grow with video. Size the storage volume from the customer's expected
media volume, not from the database size.

---

## 2. Topology

Four services, deliberately:

```
nginx      :443/:80   TLS, headers, body limits, redirect
app        :3000      Next.js (web + API)
worker     —          queue consumer + scheduler
postgres   :5432      data (or a customer-managed server instead)
```

`app` and `worker` run the same image with a different command. Volumes:

| Volume       | Mounted at                                                                 | Contents                     |
| ------------ | -------------------------------------------------------------------------- | ---------------------------- |
| `ca-uploads` | `/opt/content-approval/data/uploads`                                       | attachments, thumbnails, tmp |
| `ca-pgdata`  | `/var/lib/postgresql/data`                                                 | database                     |
| `./certs`    | `app`: `/app/certs` (read-write) — `nginx`: `/etc/nginx/certs` (read-only) | TLS certificate, key         |

`app` writes here when a certificate is uploaded from Administration -> TLS
Certificate (§6, §11); `nginx` only ever reads it.

---

## 3. Container image

Multi-stage build:

1. `deps` — `npm ci` with the committed `package-lock.json`.
2. `builder` — `prisma generate`, `next build` (standalone output).
3. `runner` — `node:22-bookworm-slim`, plus `ffmpeg`, running as a non-root
   user (`app`, uid 10001), with only the standalone output, `public/`,
   `prisma/` and `node_modules` needed at runtime.

Image rules: pinned base digest, no build toolchain in the final layer,
`USER app` before `CMD`, `HEALTHCHECK` hitting `/api/health`, read-only root
filesystem with `tmpfs` for `/tmp` where the platform allows it.

FFmpeg is a documented runtime dependency and ships in the image. In a
non-container install it must be present on the host (`dnf install ffmpeg` /
`apt install ffmpeg`) and its path set via `FFMPEG_PATH`.

---

## 4. Install with Docker Compose

**Quick path (Ubuntu 22.04/24.04):** `scripts/install.sh` automates steps 1-6
below — Docker Engine + Compose plugin, cloning the repo, generating `.env`
(session secret, database password) and a placeholder TLS certificate, the
uploads volume, `docker compose up -d`, and the migrate/bootstrap step. Run it
as root on the target host:

```bash
curl -fsSL https://raw.githubusercontent.com/yilmazerhan/social-media-post-approval/main/scripts/install.sh | sudo bash
```

Or, having already cloned the repo: `sudo bash scripts/install.sh`. See the
script's own header comment for its environment variables (`APP_DOMAIN`,
`CERT_FILE`/`KEY_FILE` for a real certificate, etc.). It still leaves the
manual steps below — a real certificate, SMTP/SAML configuration, backups —
for you to finish per §11's checklist. The rest of this section is the fully
manual walkthrough it automates, useful for understanding what it does or for
a host it doesn't fit (a different distro, an air-gapped install below).

```bash
# 1. Get the code onto the server (git clone, or a transferred archive)
sudo mkdir -p /opt/content-approval && cd /opt/content-approval
git clone <internal-git-url> app && cd app

# 2. Configure
cp .env.example .env
chmod 600 .env
# generate a session secret
openssl rand -base64 48
# edit .env: APP_URL, DATABASE_URL, SESSION_SECRET, SMTP_*, SAML_*, STORAGE_PATH
# using the containerised postgres service? DATABASE_URL's host must be
# "postgres" (the compose service name), not "localhost" — the app and
# worker containers reach it over the compose network, not the host's.
# Also set POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB to match.
$EDITOR .env

# 3. TLS material (customer-provided)
sudo mkdir -p /opt/content-approval/certs
sudo cp fullchain.pem /opt/content-approval/certs/server.crt
sudo cp privkey.pem   /opt/content-approval/certs/server.key
sudo chmod 600 /opt/content-approval/certs/server.key

# 4. Storage volume
sudo mkdir -p /opt/content-approval/data/uploads
sudo chown -R 10001:10001 /opt/content-approval/data

# 5. Start
docker compose up -d

# 6. Migrate and seed the baseline (roles, permissions, templates, schedules)
docker compose exec app npm run db:deploy
docker compose exec app npm run db:bootstrap   # admin user + system data

# 7. Verify
curl -fsS https://approval.corp.local/api/health
docker compose ps
docker compose logs -f app worker
```

`db:bootstrap` creates the first `ADMIN` account. It prompts for the email and a
password that must satisfy the password policy, and it refuses to run twice.
Demo/seed content (`npm run db:seed`) is a development-only command and is
blocked when `NODE_ENV=production`.

### Optional: two-role database (SECURITY.md §6)

For the append-only `AuditLog` guarantee to hold at the database level (not
just in application code), run `scripts/db-roles.sql` once, after step 6
above, as a Postgres superuser:

```bash
docker compose exec -T postgres psql -U postgres -d content_approval \
  -v app_password=<generated> -v migrator_password=<generated> \
  -f - < scripts/db-roles.sql
```

Then point `DATABASE_URL` at the `app` role and re-run `docker compose up -d
app worker`. Both passwords must be passed with `-v` on the command line —
never edit them into the script file itself. A single-role deployment (skip
this step; `DATABASE_URL` stays pointed at the schema-owning role) still
works — SECURITY.md documents it as the accepted, lower-assurance fallback.

### Air-gapped install

Build the image on a connected workstation, then transfer it:

```bash
docker build -t content-approval:1.0.0 .
docker save content-approval:1.0.0 | gzip > content-approval-1.0.0.tar.gz
# copy to the target host, then
gunzip -c content-approval-1.0.0.tar.gz | docker load
```

The runtime never reaches the Internet, so no registry access is needed on the
server.

---

## 5. Install with Podman

Rootless Podman is supported and recommended where policy prefers it.

```bash
podman-compose up -d
# or, generating systemd units from a pod:
podman pod create --name content-approval -p 443:8443 -p 80:8080
# … create containers into the pod …
podman generate systemd --new --files --name content-approval
sudo cp container-content-approval*.service /etc/systemd/system/
sudo systemctl enable --now container-content-approval.service
```

Notes specific to Podman:

- Add `:Z` to volume mounts on SELinux systems (RHEL): `-v ./data:/data:Z`.
- Rootless containers cannot bind ports below 1024 — either publish 8080/8443
  and front them with a host Nginx, or set
  `net.ipv4.ip_unprivileged_port_start=80`.
- File ownership inside the container maps through the user namespace; use
  `podman unshare chown -R 10001:10001 ./data` when preparing volumes.

---

## 6. Nginx

Responsibilities: TLS termination, HTTP→HTTPS redirect, security headers,
request-size limits, static assets, proxying to the app.

```nginx
server {
    listen 80;
    server_name approval.corp.local;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name approval.corp.local;

    ssl_certificate     /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options           "DENY" always;
    add_header Permissions-Policy        "camera=(), microphone=(), geolocation=()" always;

    client_max_body_size 100m;      # keep aligned with MAX_UPLOAD_SIZE
    proxy_read_timeout   120s;
    proxy_request_buffering off;    # stream uploads through

    location /_next/static/ {
        proxy_pass http://app:3000;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

Certificates are always customer-provided. Let's Encrypt is possible where the
host has Internet access and is documented as optional — it is never a
dependency. Keep `client_max_body_size` and `MAX_UPLOAD_SIZE` in step; a
mismatch produces a confusing 413 with no application-level message.

`scripts/install.sh` puts a self-signed placeholder certificate at `./certs`
on first install so HTTPS works immediately (§4, §11 — replace it before
go-live). An admin can later upload a real one from Administration -> TLS
Certificate (a `.jks` keystore, converted to PEM server-side) without ever
touching the server: `app` writes the new `server.crt`/`server.key` into the
same shared `./certs` volume nginx reads from (§2's volume table), and the
`nginx` service's `command` runs `nginx/watch-and-reload.sh` instead of the
image's default — a small wrapper that starts nginx normally and polls the
certificate files' hash every 10s, running `nginx -s reload` (graceful, drops
no in-flight connection) when they change. This is deliberately not done by
having `app` call `docker compose exec nginx nginx -s reload` itself, which
would mean mounting the Docker socket into `app` — root-equivalent access to
the host — just to trigger a reload.

---

## 7. Scheduling

**Default — internal scheduler.** `SCHEDULER_ENABLED=true` makes the worker
evaluate `JobSchedule` rows on each tick. Nothing else to configure.

**Alternative — OS scheduling.** Set `SCHEDULER_ENABLED=false` and drive the
jobs externally:

```cron
0  9 * * *  docker compose -f /opt/content-approval/app/docker-compose.yml exec -T app npm run job:enqueue -- DAILY_DIGEST
*/15 * * * * docker compose -f … exec -T app npm run job:enqueue -- SLA_CHECK
30 2 * * *  docker compose -f … exec -T app npm run job:enqueue -- RETENTION_CLEANUP
0  3 * * *  docker compose -f … exec -T app npm run job:enqueue -- ORPHAN_ATTACHMENT_CLEANUP
```

Or with systemd timers (preferred on RHEL):

```ini
# /etc/systemd/system/ca-digest.service
[Service]
Type=oneshot
ExecStart=/usr/bin/docker compose -f /opt/content-approval/app/docker-compose.yml exec -T app npm run job:enqueue -- DAILY_DIGEST

# /etc/systemd/system/ca-digest.timer
[Timer]
OnCalendar=*-*-* 09:00:00
Persistent=true
[Install]
WantedBy=timers.target
```

Enqueue is idempotent per schedule slot, so a double trigger cannot double-send.

---

## 8. Operations

```bash
docker compose ps                     # service state
docker compose logs -f app worker     # structured JSON logs
curl -fsS localhost/api/health        # liveness
curl -fsS localhost/api/ready         # dependency readiness
docker compose restart worker         # worker restarts independently
docker compose exec postgres psql -U ca -d content_approval
```

Administration → System Health surfaces the same probes plus queue depth,
failed job count and email delivery state.

### Upgrade

**Quick path:** `scripts/update.sh [branch-or-tag]` automates the steps below —
it refuses to run with uncommitted local changes, dumps the database first,
moves to the requested ref (or fast-forwards the current branch if none is
given), rebuilds, restarts `app`/`worker` only, and verifies `/api/ready`,
printing rollback instructions if it doesn't come back healthy.

```bash
cd /opt/content-approval/app
docker compose exec postgres pg_dump -U ca content_approval | gzip > /backup/pre-upgrade-$(date +%F).sql.gz
git fetch && git checkout v1.1.0
docker compose build
docker compose up -d --no-deps app worker   # migrations run at start-up, once
curl -fsS https://approval.corp.local/api/ready
```

Migrations run under an advisory lock, so a replica cannot race another. Roll
back by redeploying the previous image tag; because destructive schema changes
ship in two steps, the previous version keeps working against the newer schema.

### Rotating `SESSION_SECRET`

Rotation invalidates every session — all users are logged out. Do it during a
maintenance window, announce it, then `docker compose up -d app worker`.

### Log handling

Both processes log JSON to stdout. Collect with the host's existing setup
(`journald`, `docker compose logs`, or a log shipper the customer already runs).
Container log rotation is a daemon setting (`max-size`, `max-file`) — set it, or
disk fills quietly.

---

## 9. Non-container installation (when policy forbids containers)

```bash
# Prerequisites: Node.js 22 LTS, PostgreSQL 16, ffmpeg, nginx
sudo useradd --system --home /opt/content-approval --shell /usr/sbin/nologin capp
sudo -u capp git clone <url> /opt/content-approval/app
cd /opt/content-approval/app
sudo -u capp npm ci
sudo -u capp npx prisma migrate deploy
sudo -u capp npm run build
```

Two systemd units — `content-approval.service` (`npm run start`) and
`content-approval-worker.service` (`npm run worker`) — both with
`EnvironmentFile=/opt/content-approval/.env`, `User=capp`,
`Restart=on-failure`, `NoNewPrivileges=yes`, `ProtectSystem=strict`,
`ReadWritePaths=/opt/content-approval/data`.

---

## 10. Firewall and network

| Direction | Port       | Purpose                                              |
| --------- | ---------- | ---------------------------------------------------- |
| Inbound   | 443        | user access (and 80 for redirect only)               |
| Outbound  | 25/465/587 | corporate SMTP                                       |
| Outbound  | 443        | Entra ID SSO endpoints **only when SAML is enabled** |
| Internal  | 5432       | app/worker → PostgreSQL                              |

Nothing else. An egress policy that allows only those destinations is a
supported configuration and a good way to verify the no-cloud claim.

---

## 11. Post-install checklist

- [ ] `/api/health` and `/api/ready` both green
- [ ] HTTPS serves the customer certificate; HTTP redirects
- [ ] Security headers present (`curl -I`)
- [ ] Admin can log in; a local employee can log in
- [ ] SAML metadata reachable and imported into Entra; a test Entra login works
- [ ] Test email delivered from Administration → Email
- [ ] Upload an image and a video; thumbnails generated
- [ ] Submit → review → request changes → resubmit → approve, end to end
- [ ] Worker processing jobs; queue depth returns to zero
- [ ] Digest schedule present and enabled
- [ ] Retention policies reviewed; dry run inspected before enabling deletion
- [ ] Backups scheduled and a restore tested — see [BACKUP_RESTORE.md](./BACKUP_RESTORE.md)
- [ ] Log rotation configured
- [ ] `.env` is `chmod 600` and owned by the service user

---

## 12. Troubleshooting

| Symptom                                | Likely cause                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| App exits immediately at start         | Configuration validation failed — read the printed list                                                          |
| `/api/ready` reports storage unhealthy | `STORAGE_PATH` not writable by uid 10001, or SELinux label missing (`:Z`)                                        |
| Uploads fail at ~1 MB                  | Nginx `client_max_body_size` left at its default                                                                 |
| Emails stay `QUEUED`                   | Worker not running, or SMTP host/port/TLS wrong — check `EmailLog.lastError`                                     |
| SAML login rejected                    | ACS URL or entity id mismatch, expired IdP certificate, clock skew — check the `AUTH_SAML_REJECTED` audit reason |
| Everyone logged out after a deploy     | `SESSION_SECRET` changed                                                                                         |
| Jobs stuck `RUNNING`                   | Worker died mid-job; they return to `PENDING` after `JOB_STALE_AFTER_SECONDS`                                    |

---

## 13. References

- Docker Compose — https://docs.docker.com/compose/
- Podman — https://docs.podman.io/en/latest/
- `podman generate systemd` — https://docs.podman.io/en/latest/markdown/podman-generate-systemd.1.html
- Next.js self-hosting / standalone output — https://nextjs.org/docs/app/building-your-application/deploying
- Nginx reverse proxy — https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- Mozilla SSL Configuration Generator — https://ssl-config.mozilla.org/
- PostgreSQL server administration — https://www.postgresql.org/docs/16/admin.html
- systemd.timer — https://www.freedesktop.org/software/systemd/man/systemd.timer.html
