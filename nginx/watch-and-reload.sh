#!/bin/sh
# DEPLOYMENT.md §6 — picks up a certificate uploaded from Administration ->
# TLS Certificate without giving the `app` container access to the Docker
# socket (which would mean root-equivalent access to the host) just so it
# can ask nginx to reload. Free/OSS nginx has no built-in "watch this file"
# feature, so this polls the certificate files' hash and reloads on
# change instead — `nginx -s reload` is graceful, it never drops a
# connection in flight.
#
# docker-compose.yml overrides only the nginx service's `command:`, not
# its `entrypoint:`, so the image's own docker-entrypoint.sh (templating,
# permission checks) still runs first and execs this as its final "$@".
set -e

CERT_DIR="/etc/nginx/certs"
POLL_SECONDS=10

nginx -g "daemon off;" &
NGINX_PID=$!
trap 'kill -TERM "$NGINX_PID" 2>/dev/null' TERM INT

LAST_HASH=""
while kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep "$POLL_SECONDS"
  CUR_HASH=$(cat "$CERT_DIR/server.crt" "$CERT_DIR/server.key" 2>/dev/null | md5sum | cut -d' ' -f1)
  if [ -n "$CUR_HASH" ] && [ -n "$LAST_HASH" ] && [ "$CUR_HASH" != "$LAST_HASH" ]; then
    echo "Certificate changed, reloading nginx..."
    nginx -s reload
  fi
  LAST_HASH="$CUR_HASH"
done

wait "$NGINX_PID"
