-- V2 — platform job infrastructure.
--
-- ShedLock's lock table and the job run ledger. Both are platform concerns, not business features:
-- they exist so that scheduled work is cluster-safe and observable from the first job onwards
-- (ARCHITECTURE.md sections 9.1 and 9.2).

CREATE TABLE shedlock (
    name       VARCHAR(64)  NOT NULL PRIMARY KEY,
    lock_until TIMESTAMPTZ  NOT NULL,
    locked_at  TIMESTAMPTZ  NOT NULL,
    locked_by  VARCHAR(255) NOT NULL
);

COMMENT ON TABLE shedlock IS 'ShedLock mutual exclusion for scheduled jobs across replicas.';

-- One row per job execution: what ran, how long it took, how much it processed and how it ended.
-- A job that fails silently is worse than one that does not run at all.
CREATE TABLE job_run (
    id              UUID         PRIMARY KEY,
    job_name        VARCHAR(120) NOT NULL,
    started_at      TIMESTAMPTZ  NOT NULL,
    finished_at     TIMESTAMPTZ,
    status          VARCHAR(20)  NOT NULL,
    items_processed INTEGER      NOT NULL DEFAULT 0,
    items_failed    INTEGER      NOT NULL DEFAULT 0,
    details         JSONB,
    error           TEXT,
    triggered_by    VARCHAR(120) NOT NULL DEFAULT 'SCHEDULER',
    CONSTRAINT job_run_status_check CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'))
);

CREATE INDEX job_run_name_started_idx ON job_run (job_name, started_at DESC);
CREATE INDEX job_run_unfinished_idx ON job_run (job_name) WHERE finished_at IS NULL;
