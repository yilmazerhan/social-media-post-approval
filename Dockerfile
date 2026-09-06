# syntax=docker/dockerfile:1
# DEPLOYMENT.md §3. Multi-stage: deps -> builder -> runner. `app` and
# `worker` (DEPLOYMENT.md §2) both run this same image with a different
# command.

FROM node:22.11.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22.11.0-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# The runner keeps the full `node_modules` and TypeScript source rather
# than only Next's standalone-traced subset: `npm run worker`,
# `db:bootstrap` and `job:enqueue` all execute TypeScript directly via
# `tsx` (a devDependency), and `docker-entrypoint.sh` needs the `prisma`
# CLI to run migrations — neither is reachable from Next's standalone
# tracing, which only follows the web app's own runtime imports. The `app`
# command still runs the lighter standalone `server.js` rather than
# `next start`.
FROM node:22.11.0-bookworm-slim AS runner
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --shell /usr/sbin/nologin --no-create-home app

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# `.next/standalone` carries server.js *and* the compiled `.next/server`
# chunks it needs to actually serve a request, plus its own pruned
# node_modules — copy the whole thing first, then overlay the full
# node_modules and source on top (see the comment above).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/data/uploads \
    && chown -R app:app /app

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
