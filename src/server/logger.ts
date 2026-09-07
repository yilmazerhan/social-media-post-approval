import pino from "pino";
import pinoPretty from "pino-pretty";
import { config } from "@/server/config";

/**
 * Structured logging — see ARCHITECTURE.md §9 and SECURITY.md §7.
 * Never logged, in any category: passwords, session cookies/ids, CSRF
 * tokens, reset tokens, SAML assertions, SMTP credentials, DATABASE_URL.
 */
const REDACT_PATHS = [
  "password",
  "passwordHash",
  "newPassword",
  "currentPassword",
  "*.password",
  "*.passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "sessionSecret",
  "resetToken",
  "csrfToken",
  "*.token",
  "cookie",
  "cookies",
  "*.cookie",
  "req.headers.cookie",
  "req.headers.authorization",
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  "samlResponse",
  "SAMLResponse",
  "assertion",
  "smtpPassword",
  "SMTP_PASSWORD",
  "databaseUrl",
  "DATABASE_URL",
];

/**
 * `pino-pretty` is wired in as a synchronous destination stream, not via
 * pino's `transport` option — `transport` always spawns a worker thread
 * (through `thread-stream`), and that worker fails to resolve inside
 * Next.js/Turbopack's build-time module sandbox (surfaced once a route
 * handler first imported this module during `next build`'s page-data
 * collection). This form runs pino-pretty in-process instead, which
 * works in every context this logger loads in.
 */
const baseLogger = pino(
  {
    level: config.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: REDACT_PATHS,
      censor: "«redacted»",
    },
  },
  config.LOG_FORMAT === "pretty"
    ? pinoPretty({ colorize: true, translateTime: "SYS:standard" })
    : undefined,
);

export type LogCategory =
  "app" | "security" | "auth" | "audit" | "worker" | "http";

export function createLogger(category: LogCategory) {
  return baseLogger.child({ category });
}

export const appLogger = createLogger("app");
export const securityLogger = createLogger("security");
export const authLogger = createLogger("auth");
export const auditLogger = createLogger("audit");
export const workerLogger = createLogger("worker");
export const httpLogger = createLogger("http");
