-- V1 — baseline.
--
-- Phase 0 only wires Flyway and the extensions the later phases rely on. Feature tables arrive
-- with their phases (ARCHITECTURE.md section 19.2) so that entity design is not frozen before the
-- open questions in section 20 are answered.
--
-- Migrations are forward-only and must stay backwards compatible with the currently deployed
-- version: rolling deployments run old and new code against the same schema (section 4.4).

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_bytes for token generation
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email addresses
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram search on names and titles

-- Runtime-tunable settings an administrator may change without a deployment.
-- Secrets never live here; they come from the environment (section 12.4).
CREATE TABLE app_setting (
    key         VARCHAR(120) PRIMARY KEY,
    value       JSONB        NOT NULL,
    category    VARCHAR(60)  NOT NULL DEFAULT 'GENERAL',
    description TEXT,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by  UUID
);

COMMENT ON TABLE app_setting IS 'Administrator-tunable runtime configuration. See ARCHITECTURE.md 17.1.';

INSERT INTO app_setting (key, value, category, description) VALUES
    ('schema.baseline', '{"version":"1","phase":"0"}'::jsonb, 'SYSTEM', 'Marks the architecture baseline migration.')
ON CONFLICT (key) DO NOTHING;
