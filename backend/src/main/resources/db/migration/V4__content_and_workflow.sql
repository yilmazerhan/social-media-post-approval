-- V4 — content, workflow, collaboration, AI review and notifications.
--
-- The tables behind the two hero screens. Two invariants are enforced here as well as in the
-- domain: a post_version is immutable once written, and an approval_decision always names the
-- exact version the approver saw (ARCHITECTURE.md sections 10.5 and 16.2).

CREATE TABLE channel (
    id          UUID         PRIMARY KEY,
    code        VARCHAR(48)  NOT NULL UNIQUE,
    name        VARCHAR(160) NOT NULL,
    description TEXT,
    constraints JSONB        NOT NULL DEFAULT '{}'::jsonb,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order  INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE post (
    id                 UUID         PRIMARY KEY,
    title              VARCHAR(300) NOT NULL,
    body_html          TEXT         NOT NULL DEFAULT '',
    body_text          TEXT         NOT NULL DEFAULT '',
    status             VARCHAR(24)  NOT NULL,
    author_id          UUID         NOT NULL REFERENCES app_user (id),
    channel_id         UUID         REFERENCES channel (id),
    priority           VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    current_version_no INTEGER      NOT NULL DEFAULT 0,
    submitted_at       TIMESTAMPTZ,
    decided_at         TIMESTAMPTZ,
    published_at       TIMESTAMPTZ,
    due_at             TIMESTAMPTZ,
    sla_state          VARCHAR(16)  NOT NULL DEFAULT 'NONE',
    optimistic_version BIGINT       NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by         UUID         REFERENCES app_user (id),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by         UUID         REFERENCES app_user (id),
    deleted_at         TIMESTAMPTZ,
    CONSTRAINT post_status_check CHECK (status IN (
        'DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED',
        'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'EXPIRED')),
    CONSTRAINT post_priority_check CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT post_sla_state_check CHECK (sla_state IN ('NONE', 'ON_TRACK', 'WARNING', 'BREACHED'))
);

CREATE INDEX post_author_idx ON post (author_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX post_status_idx ON post (status, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX post_title_trgm_idx ON post USING gin (title gin_trgm_ops);

-- Immutable content snapshots. An approver's decision is tied to one of these rows, so a reviewer
-- can always be shown exactly the bytes they judged.
CREATE TABLE post_version (
    id                   UUID         PRIMARY KEY,
    post_id              UUID         NOT NULL REFERENCES post (id) ON DELETE CASCADE,
    version_no           INTEGER      NOT NULL,
    title                VARCHAR(300) NOT NULL,
    body_html            TEXT         NOT NULL,
    body_text            TEXT         NOT NULL,
    attachment_manifest  JSONB        NOT NULL DEFAULT '[]'::jsonb,
    reason               VARCHAR(24)  NOT NULL,
    created_by           UUID         NOT NULL REFERENCES app_user (id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT post_version_reason_check CHECK (reason IN ('DRAFT', 'SUBMISSION', 'DECISION', 'RESTORE')),
    CONSTRAINT post_version_unique UNIQUE (post_id, version_no)
);

CREATE TABLE attachment (
    id                    UUID         PRIMARY KEY,
    post_id               UUID         NOT NULL REFERENCES post (id) ON DELETE CASCADE,
    kind                  VARCHAR(16)  NOT NULL,
    original_filename     VARCHAR(400) NOT NULL,
    content_type_declared VARCHAR(160) NOT NULL,
    content_type_detected VARCHAR(160),
    size_bytes            BIGINT       NOT NULL DEFAULT 0,
    content_hash          VARCHAR(80),
    storage_bucket        VARCHAR(120) NOT NULL,
    storage_key           VARCHAR(500) NOT NULL,
    status                VARCHAR(20)  NOT NULL,
    scan_result           VARCHAR(200),
    width                 INTEGER,
    height                INTEGER,
    duration_seconds      INTEGER,
    alt_text              VARCHAR(500),
    caption               VARCHAR(500),
    sort_order            INTEGER      NOT NULL DEFAULT 0,
    uploaded_by           UUID         NOT NULL REFERENCES app_user (id),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ,
    CONSTRAINT attachment_kind_check CHECK (kind IN ('IMAGE', 'VIDEO', 'DOCUMENT')),
    CONSTRAINT attachment_status_check CHECK (status IN
        ('PENDING', 'UPLOADED', 'SCANNING', 'READY', 'QUARANTINED', 'FAILED'))
);

CREATE INDEX attachment_post_idx ON attachment (post_id, sort_order) WHERE deleted_at IS NULL;

CREATE TABLE approval_request (
    id                 UUID         PRIMARY KEY,
    post_id            UUID         NOT NULL REFERENCES post (id) ON DELETE CASCADE,
    post_version_id    UUID         NOT NULL REFERENCES post_version (id),
    status             VARCHAR(24)  NOT NULL,
    mode               VARCHAR(16)  NOT NULL DEFAULT 'ANY_ONE',
    required_approvals INTEGER      NOT NULL DEFAULT 1,
    requested_by       UUID         NOT NULL REFERENCES app_user (id),
    requested_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    due_at             TIMESTAMPTZ  NOT NULL,
    sla_state          VARCHAR(16)  NOT NULL DEFAULT 'ON_TRACK',
    completed_at       TIMESTAMPTZ,
    outcome_reason     TEXT,
    escalation_level   INTEGER      NOT NULL DEFAULT 0,
    optimistic_version BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT approval_request_status_check CHECK (status IN
        ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED', 'EXPIRED')),
    CONSTRAINT approval_request_mode_check CHECK (mode IN ('ANY_ONE', 'ALL', 'SEQUENTIAL')),
    CONSTRAINT approval_request_sla_check CHECK (sla_state IN ('ON_TRACK', 'WARNING', 'BREACHED'))
);

CREATE INDEX approval_request_post_idx ON approval_request (post_id, requested_at DESC);
CREATE INDEX approval_request_open_idx ON approval_request (due_at) WHERE status = 'PENDING';

CREATE TABLE approval_step (
    id                  UUID        PRIMARY KEY,
    approval_request_id UUID        NOT NULL REFERENCES approval_request (id) ON DELETE CASCADE,
    step_no             INTEGER     NOT NULL,
    assignee_id         UUID        NOT NULL REFERENCES app_user (id),
    assigned_by         UUID        REFERENCES app_user (id),
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    status              VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    notified_at         TIMESTAMPTZ,
    reminded_at         TIMESTAMPTZ,
    CONSTRAINT approval_step_status_check CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED', 'REASSIGNED')),
    CONSTRAINT approval_step_unique UNIQUE (approval_request_id, assignee_id)
);

CREATE INDEX approval_step_assignee_idx ON approval_step (assignee_id, status);

-- Immutable once written. A reviewer who changes their mind starts a new cycle, which is exactly
-- what the record should show.
CREATE TABLE approval_decision (
    id                  UUID        PRIMARY KEY,
    approval_request_id UUID        NOT NULL REFERENCES approval_request (id) ON DELETE CASCADE,
    approval_step_id    UUID        NOT NULL REFERENCES approval_step (id) ON DELETE CASCADE,
    post_version_id     UUID        NOT NULL REFERENCES post_version (id),
    decided_by          UUID        NOT NULL REFERENCES app_user (id),
    decision            VARCHAR(24) NOT NULL,
    comment             TEXT,
    decided_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address          VARCHAR(64),
    CONSTRAINT approval_decision_check CHECK (decision IN ('APPROVE', 'REJECT', 'REQUEST_CHANGES'))
);

CREATE INDEX approval_decision_request_idx ON approval_decision (approval_request_id, decided_at);

CREATE TABLE post_comment (
    id                  UUID        PRIMARY KEY,
    post_id             UUID        NOT NULL REFERENCES post (id) ON DELETE CASCADE,
    approval_request_id UUID        REFERENCES approval_request (id) ON DELETE SET NULL,
    parent_comment_id   UUID        REFERENCES post_comment (id) ON DELETE CASCADE,
    author_id           UUID        NOT NULL REFERENCES app_user (id),
    body                TEXT        NOT NULL,
    is_internal         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at           TIMESTAMPTZ,
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX post_comment_post_idx ON post_comment (post_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE ai_review (
    id                UUID         PRIMARY KEY,
    post_id           UUID         NOT NULL REFERENCES post (id) ON DELETE CASCADE,
    post_version_id   UUID         REFERENCES post_version (id) ON DELETE SET NULL,
    provider          VARCHAR(48)  NOT NULL,
    model             VARCHAR(96),
    status            VARCHAR(16)  NOT NULL,
    risk_level        VARCHAR(16),
    risk_score        INTEGER,
    summary           TEXT,
    prompt_tokens     INTEGER,
    completion_tokens INTEGER,
    latency_ms        INTEGER,
    error             TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    completed_at      TIMESTAMPTZ,
    purge_after       TIMESTAMPTZ,
    CONSTRAINT ai_review_status_check CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')),
    CONSTRAINT ai_review_risk_check CHECK (risk_level IS NULL OR risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX ai_review_post_idx ON ai_review (post_id, created_at DESC);

CREATE TABLE ai_finding (
    id              UUID        PRIMARY KEY,
    ai_review_id    UUID        NOT NULL REFERENCES ai_review (id) ON DELETE CASCADE,
    category        VARCHAR(32) NOT NULL,
    severity        VARCHAR(16) NOT NULL,
    title           VARCHAR(240) NOT NULL,
    excerpt         TEXT,
    explanation     TEXT        NOT NULL,
    suggestion      TEXT,
    acknowledged_by UUID        REFERENCES app_user (id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    dismissed_by    UUID        REFERENCES app_user (id) ON DELETE SET NULL,
    dismissed_at    TIMESTAMPTZ,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    CONSTRAINT ai_finding_severity_check CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    CONSTRAINT ai_finding_category_check CHECK (category IN
        ('SECURITY', 'PRIVACY', 'COMPLIANCE', 'BRAND', 'TONE', 'QUALITY', 'ACCESSIBILITY', 'CHANNEL_FIT'))
);

CREATE INDEX ai_finding_review_idx ON ai_finding (ai_review_id, sort_order);

CREATE TABLE notification (
    id          UUID         PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    type        VARCHAR(64)  NOT NULL,
    title       VARCHAR(240) NOT NULL,
    body        TEXT,
    entity_type VARCHAR(48),
    entity_id   UUID,
    data        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    priority    VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX notification_user_idx ON notification (user_id, created_at DESC);
CREATE INDEX notification_unread_idx ON notification (user_id) WHERE read_at IS NULL;

INSERT INTO channel (id, code, name, description, constraints, sort_order) VALUES
    (gen_random_uuid(), 'INTRANET', 'Intranet announcement',
     'Internal announcement published on the corporate intranet.',
     '{"maxCharacters": 4000, "allowsVideo": true, "allowsImage": true}'::jsonb, 1),
    (gen_random_uuid(), 'LINKEDIN', 'LinkedIn',
     'Corporate LinkedIn page.',
     '{"maxCharacters": 3000, "recommendedCharacters": 1300, "allowsVideo": true, "allowsImage": true}'::jsonb, 2),
    (gen_random_uuid(), 'NEWSLETTER', 'Customer newsletter',
     'Monthly customer newsletter.',
     '{"maxCharacters": 6000, "allowsVideo": false, "allowsImage": true}'::jsonb, 3);
