import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { z } from "zod";

/**
 * Single source of truth for runtime configuration. Every variable here
 * mirrors a row in CONFIGURATION.md — that document is authoritative;
 * this file implements it. Nothing else in the codebase should read
 * `process.env` directly.
 *
 * Any variable may be supplied as `<NAME>_FILE` instead, pointing at a
 * file whose (trimmed) contents become the value — this is what lets
 * Docker/Podman secrets work without putting values in the environment.
 */

function readEnv(key: string): string | undefined {
  const filePath = process.env[`${key}_FILE`];
  if (filePath) {
    try {
      return readFileSync(filePath, "utf8").trim();
    } catch (error) {
      throw new ConfigError(
        `Cannot read ${key}_FILE="${filePath}": ${(error as Error).message}`,
      );
    }
  }
  return process.env[key];
}

export class ConfigError extends Error {}

/** Resolves every schema key through readEnv() (env var or its _FILE variant). */
const rawEnv = new Proxy(
  {},
  {
    get: (_target, prop: string) => readEnv(prop),
    has: () => true,
  },
) as Record<string, string | undefined>;

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

function zBool(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === undefined) return defaultValue;
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    return value;
  }, z.boolean());
}

function zInt(defaultValue: number, opts: { min?: number; max?: number } = {}) {
  let schema = z.coerce.number().int();
  if (opts.min !== undefined) schema = schema.min(opts.min);
  if (opts.max !== undefined) schema = schema.max(opts.max);
  return z.preprocess(
    (value) => (value === undefined || value === "" ? defaultValue : value),
    schema,
  );
}

function zCsv(defaultValue: string) {
  return z
    .string()
    .default(defaultValue)
    .transform((value) =>
      value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
}

const optionalUrl = z.string().url().optional();

const envSchema = z
  .object({
    // ---- 1. Application ----------------------------------------------
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("production"),
    APP_NAME: z.string().default("Content Approval"),
    APP_URL: z.string().url(),
    PORT: zInt(3000, { min: 1, max: 65535 }),
    APP_TIMEZONE: z.string().default("Europe/Istanbul"),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal"])
      .default("info"),
    LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
    TRUST_PROXY: zBool(true),
    TRUST_PROXY_HOPS: zInt(1, { min: 0 }),

    // ---- 2. Database ---------------------------------------------------
    DATABASE_URL: z
      .string()
      .regex(
        /^postgres(ql)?:\/\//,
        "DATABASE_URL must be a postgresql:// connection string",
      ),
    DATABASE_POOL_SIZE: zInt(10, { min: 1 }),
    DATABASE_CONNECT_TIMEOUT: zInt(10, { min: 1 }),
    DATABASE_STATEMENT_TIMEOUT_MS: zInt(15000, { min: 0 }),
    DATABASE_SSL: zBool(false),
    DATABASE_SSL_CA_FILE: z.string().optional(),

    // ---- 3. Security and session ---------------------------------------
    SESSION_SECRET: z
      .string()
      .min(32, "SESSION_SECRET must be at least 32 characters"),
    SESSION_COOKIE_NAME: z.string().default("ca_session"),
    SESSION_ABSOLUTE_TIMEOUT_MINUTES: zInt(480, { min: 1 }),
    SESSION_IDLE_TIMEOUT_MINUTES: zInt(60, { min: 1 }),
    SESSION_REVOKE_ON_ROLE_CHANGE: zBool(false),
    COOKIE_SECURE: z.preprocess((value) => {
      if (value === undefined || value === "") return undefined;
      return value;
    }, zBool(true).optional()),
    CSRF_COOKIE_NAME: z.string().default("ca_csrf"),
    RATE_LIMIT_AUTH_MAX: zInt(10, { min: 1 }),
    RATE_LIMIT_AUTH_WINDOW_MINUTES: zInt(15, { min: 1 }),
    RATE_LIMIT_MUTATION_MAX: zInt(120, { min: 1 }),
    LOCKOUT_THRESHOLD: zInt(5, { min: 1 }),
    LOCKOUT_DURATION_MINUTES: zInt(15, { min: 1 }),
    PASSWORD_MIN_LENGTH: zInt(12, { min: 8 }),
    PASSWORD_REQUIRE_UPPER: zBool(true),
    PASSWORD_REQUIRE_LOWER: zBool(true),
    PASSWORD_REQUIRE_DIGIT: zBool(true),
    PASSWORD_REQUIRE_SYMBOL: zBool(false),
    PASSWORD_HISTORY_COUNT: zInt(5, { min: 0 }),
    PASSWORD_MAX_AGE_DAYS: zInt(0, { min: 0 }),
    PASSWORD_RESET_TTL_MINUTES: zInt(60, { min: 1 }),
    ARGON2_MEMORY_KIB: zInt(19456, { min: 8192 }),
    ARGON2_TIME_COST: zInt(2, { min: 1 }),
    ARGON2_PARALLELISM: zInt(1, { min: 1 }),

    // ---- 4. Authentication providers -----------------------------------
    AUTH_LOCAL_ENABLED: zBool(true),
    AUTH_SAML_ENABLED: zBool(false),
    SAML_ENTITY_ID: z.string().optional(),
    SAML_ACS_URL: optionalUrl,
    SAML_IDP_ENTITY_ID: z.string().optional(),
    SAML_IDP_SSO_URL: optionalUrl,
    SAML_IDP_SLO_URL: optionalUrl,
    SAML_IDP_CERTIFICATE: z.string().optional(),
    SAML_IDP_METADATA_FILE: z.string().optional(),
    SAML_SP_PRIVATE_KEY_FILE: z.string().optional(),
    SAML_SP_CERTIFICATE_FILE: z.string().optional(),
    SAML_WANT_ASSERTIONS_SIGNED: zBool(true),
    SAML_WANT_RESPONSE_SIGNED: zBool(true),
    SAML_SIGNATURE_ALGORITHM: z
      .enum(["sha256", "sha384", "sha512"])
      .default("sha256"),
    SAML_CLOCK_SKEW_SECONDS: zInt(60, { min: 0 }),
    SAML_JIT_PROVISIONING: zBool(true),
    SAML_JIT_DEFAULT_ROLE: z.string().default("EMPLOYEE"),
    SAML_JIT_FORBID_ADMIN: zBool(true),
    SAML_ALLOW_LOCAL_LINK: zBool(false),
    SAML_ATTR_EMAIL: z
      .string()
      .default(
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      ),
    SAML_ATTR_FIRST_NAME: z
      .string()
      .default(
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
      ),
    SAML_ATTR_LAST_NAME: z
      .string()
      .default("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"),
    SAML_ATTR_DISPLAY_NAME: z
      .string()
      .default("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"),
    SAML_ATTR_OBJECT_ID: z
      .string()
      .default("http://schemas.microsoft.com/identity/claims/objectidentifier"),
    SAML_ATTR_GROUPS: z
      .string()
      .default(
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
      ),
    SAML_ATTR_DEPARTMENT: z.string().default("department"),
    SAML_ATTR_JOB_TITLE: z.string().default("jobtitle"),

    // ---- 5. SMTP / email -------------------------------------------------
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: zInt(587, { min: 1, max: 65535 }),
    SMTP_USERNAME: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().min(3),
    SMTP_REPLY_TO: z.string().optional(),
    SMTP_TLS: z.enum(["none", "starttls", "tls"]).default("starttls"),
    SMTP_TLS_REJECT_UNAUTHORIZED: zBool(true),
    SMTP_TIMEOUT_MS: zInt(15000, { min: 1000 }),
    EMAIL_ENABLED: zBool(true),
    EMAIL_MAX_ATTEMPTS: zInt(5, { min: 1 }),
    EMAIL_RETRY_BASE_SECONDS: zInt(60, { min: 1 }),
    ALLOW_INSECURE_SMTP: zBool(false),

    // ---- 6. Storage and media -------------------------------------------
    STORAGE_PATH: z.string().default("/opt/content-approval/data/uploads"),
    STORAGE_TMP_PATH: z.string().optional(),
    MAX_UPLOAD_SIZE: zInt(104_857_600, { min: 1 }),
    MAX_IMAGE_SIZE: zInt(10_485_760, { min: 1 }),
    MAX_ATTACHMENTS_PER_POST: zInt(10, { min: 1 }),
    ALLOWED_IMAGE_TYPES: zCsv("image/jpeg,image/png,image/webp,image/gif"),
    ALLOWED_VIDEO_TYPES: zCsv("video/mp4,video/webm,video/quicktime"),
    THUMBNAIL_WIDTH: zInt(480, { min: 16 }),
    FFMPEG_PATH: z.string().default("/usr/bin/ffmpeg"),
    FFPROBE_PATH: z.string().default("/usr/bin/ffprobe"),
    UPLOAD_TMP_TTL_MINUTES: zInt(240, { min: 1 }),

    // ---- 7. Worker and jobs ----------------------------------------------
    WORKER_ENABLED: zBool(true),
    WORKER_CONCURRENCY: zInt(4, { min: 1 }),
    WORKER_POLL_INTERVAL_MS: zInt(2000, { min: 100 }),
    WORKER_ID: z.string().optional(),
    JOB_STALE_AFTER_SECONDS: zInt(900, { min: 1 }),
    JOB_DEFAULT_MAX_ATTEMPTS: zInt(5, { min: 1 }),
    SCHEDULER_ENABLED: zBool(true),
    SCHEDULER_TICK_SECONDS: zInt(30, { min: 1 }),

    // ---- 8. Workflow defaults (bootstrap values for SystemSetting) ------
    SLA_DEFAULT_MINUTES: zInt(1440, { min: 1 }),
    SLA_WARNING_PERCENT: zInt(75, { min: 1, max: 100 }),
    SLA_ESCALATION_MINUTES: zInt(2880, { min: 1 }),
    DIGEST_HOUR: zInt(9, { min: 0, max: 23 }),
    DIGEST_ENABLED: zBool(true),
    RETENTION_DAYS: zInt(30, { min: 1 }),
    RETENTION_ATTACHMENT_DAYS: zInt(30, { min: 1 }),
    RETENTION_NOTIFICATION_DAYS: zInt(90, { min: 1 }),
    RETENTION_EMAIL_LOG_DAYS: zInt(180, { min: 1 }),
    RETENTION_AUDIT_LOG_DAYS: zInt(730, { min: 1 }),
    RETENTION_JOB_DAYS: zInt(30, { min: 1 }),
    RETENTION_DRY_RUN: zBool(true),
    POST_MAX_CHARACTERS: zInt(2200, { min: 1 }),
    AUTOSAVE_INTERVAL_SECONDS: zInt(3, { min: 1 }),
    COMMENT_MAX_CHARACTERS: zInt(2000, { min: 1 }),
    COMMENT_EDIT_WINDOW_MINUTES: zInt(30, { min: 0 }),
  })
  .superRefine((data, ctx) => {
    if (data.AUTH_SAML_ENABLED) {
      const requiredWhenSaml: Array<[unknown, string]> = [
        [data.SAML_ENTITY_ID, "SAML_ENTITY_ID"],
        [data.SAML_IDP_ENTITY_ID, "SAML_IDP_ENTITY_ID"],
        [data.SAML_IDP_SSO_URL, "SAML_IDP_SSO_URL"],
      ];
      for (const [value, key] of requiredWhenSaml) {
        if (!value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when AUTH_SAML_ENABLED=true`,
          });
        }
      }
      if (!data.SAML_IDP_CERTIFICATE && !data.SAML_IDP_METADATA_FILE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SAML_IDP_CERTIFICATE"],
          message:
            "SAML_IDP_CERTIFICATE or SAML_IDP_METADATA_FILE is required when AUTH_SAML_ENABLED=true",
        });
      }
    }

    if (data.NODE_ENV === "production") {
      const placeholderPattern = /changeme|example|replace_me|default/i;
      if (placeholderPattern.test(data.SESSION_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SESSION_SECRET"],
          message:
            "SESSION_SECRET looks like a placeholder value — generate a real secret for production",
        });
      }
      if (data.APP_URL.startsWith("https://") && data.COOKIE_SECURE === false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["COOKIE_SECURE"],
          message:
            "COOKIE_SECURE cannot be false in production behind an https APP_URL",
        });
      }
      if (!data.SMTP_TLS_REJECT_UNAUTHORIZED && !data.ALLOW_INSECURE_SMTP) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SMTP_TLS_REJECT_UNAUTHORIZED"],
          message:
            "SMTP_TLS_REJECT_UNAUTHORIZED=false requires ALLOW_INSECURE_SMTP=true to be explicit about the risk",
        });
      }
    }
  });

type ParsedEnv = z.infer<typeof envSchema>;

export interface AppConfig extends Omit<
  ParsedEnv,
  "COOKIE_SECURE" | "WORKER_ID" | "STORAGE_TMP_PATH" | "SAML_ACS_URL"
> {
  COOKIE_SECURE: boolean;
  WORKER_ID: string;
  STORAGE_TMP_PATH: string;
  SAML_ACS_URL: string;
}

/** Fields whose values must never be printed, logged or echoed anywhere. */
const SECRET_KEYS = new Set([
  "SESSION_SECRET",
  "DATABASE_URL",
  "SMTP_PASSWORD",
  "SAML_IDP_CERTIFICATE",
]);

function redactedSummary(config: AppConfig): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    summary[key] = SECRET_KEYS.has(key) && value ? "«redacted»" : value;
  }
  return summary;
}

function assemble(parsed: ParsedEnv): AppConfig {
  return {
    ...parsed,
    COOKIE_SECURE: parsed.COOKIE_SECURE ?? parsed.NODE_ENV === "production",
    WORKER_ID: parsed.WORKER_ID || hostname(),
    STORAGE_TMP_PATH: parsed.STORAGE_TMP_PATH || `${parsed.STORAGE_PATH}/tmp`,
    SAML_ACS_URL:
      parsed.SAML_ACS_URL || `${parsed.APP_URL}/api/v1/auth/saml/acs`,
  };
}

function loadConfig(): AppConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    );
    console.error(
      `[boot] Invalid configuration — refusing to start:\n${lines.join("\n")}`,
    );
    process.exit(1);
  }

  const config = assemble(result.data);
  console.error(
    `[boot] Configuration loaded: ${JSON.stringify(redactedSummary(config))}`,
  );
  return config;
}

let cached: AppConfig | undefined;

/** Validated, fail-fast application configuration. Parsed once, cached. */
export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}

export const config = getConfig();
