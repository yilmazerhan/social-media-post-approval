#!/bin/sh
# DEPLOYMENT.md §8 "Upgrade" — migrations run at start-up, once. This runs
# in both the `app` and `worker` containers (DEPLOYMENT.md §2: same image,
# different command), and `prisma migrate deploy` itself takes a
# PostgreSQL advisory lock before applying anything, so whichever
# container (or replica) gets there first runs the migration while the
# others block, then find nothing pending and continue immediately —
# "a replica cannot race another" holds without any extra locking code
# here.
set -eu

echo "Applying database migrations..."
npx prisma migrate deploy

exec "$@"
