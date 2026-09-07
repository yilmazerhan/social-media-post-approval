import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/server/config";

/**
 * Prisma client singleton. Cached on `globalThis` in development so
 * Next.js hot reload doesn't open a fresh connection pool on every edit.
 *
 * Transactions: use `prisma.$transaction(async (tx) => { ... })` directly
 * at the call site — Prisma's own interactive transactions already cover
 * what a hand-written wrapper would add.
 */

const adapter = new PrismaPg({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_SIZE,
  connectionTimeoutMillis: config.DATABASE_CONNECT_TIMEOUT * 1000,
  statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
  ssl: config.DATABASE_SSL
    ? {
        rejectUnauthorized: true,
        ca: config.DATABASE_SSL_CA_FILE
          ? readFileSync(config.DATABASE_SSL_CA_FILE, "utf8")
          : undefined,
      }
    : undefined,
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      config.LOG_LEVEL === "trace" || config.LOG_LEVEL === "debug"
        ? ["query"]
        : [],
  });

if (config.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { Prisma } from "@/generated/prisma/client";
