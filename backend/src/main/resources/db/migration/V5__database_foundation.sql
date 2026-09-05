-- V5 — database foundation.
--
-- Completes the schema: organisational structure (departments, groups), approval routing rules,
-- the governance tables (audit log, email log, SLA records, retention policies, system settings),
-- and a restructured identity model.
--
-- IDENTITY CHANGE. V3 modelled sign-in as a separate `identity_link` table so one person could hold
-- several identities (an administrator with both an Entra account and a break-glass local one).
-- The agreed model is simpler: one authentication provider per user, carried on the user row, with
-- uniqueness on (auth_provider, external_identity_id). That is what this migration moves to. The
-- trade-off is recorded in ARCHITECTURE.md ADR 23 — a user who needs both routes now needs two
-- accounts, and re-introducing multi-identity later means restoring a link table.
--
-- Forward-only, per ARCHITECTURE.md 4.4: V3 is not edited, it is superseded.

-- =================================================================================================
-- Organisation
-- =================================================================================================

CREATE TABLE department (
    id                   UUID         PRIMARY KEY,
    code                 VARCHAR(64)  NOT NULL UNIQUE,
    name                 VARCHAR(200) NOT NULL,
    description          TEXT,
    parent_department_id UUID         REFERENCES department (id) ON DELETE SET NULL,
    manager_id           UUID,
    enabled              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX department_parent_idx ON department (parent_department_id);

COMMENT ON TABLE department IS 'Organisational unit. Drives approval routing and reporting.';

-- "group" is reserved in SQL, so the table carries the app_ prefix; the entity is Group.
CREATE TABLE app_group (
    id                UUID         PRIMARY KEY,
    code              VARCHAR(64)  NOT NULL UNIQUE,
    name              VARCHAR(200) NOT NULL,
    description       TEXT,
    kind              VARCHAR(24)  NOT NULL DEFAULT 'STATIC',
    external_group_id VARCHAR(255),
    enabled           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT app_group_kind_check CHECK (kind IN ('STATIC', 'DIRECTORY_SYNCED'))
);

-- A directory-synced group is matched on its immutable external id, never on its display name.
CREATE UNIQUE INDEX app_group_external_key ON app_group (external_group_id)
    WHERE external_group_id IS NOT NULL;

-- =================================================================================================
-- Identity: fold the provider, external identity and credential onto the user row
-- =================================================================================================

ALTER TABLE app_user
    ADD COLUMN department_id          UUID REFERENCES department (id) ON DELETE SET NULL,
    ADD COLUMN auth_provider          VARCHAR(24),
    ADD COLUMN external_identity_id   VARCHAR(255),
    ADD COLUMN password_hash          VARCHAR(255),
    ADD COLUMN password_updated_at    TIMESTAMPTZ,
    ADD COLUMN must_change_password   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN locked_until           TIMESTAMPTZ;

-- Departments were free text on the user row; promote the distinct values to real rows.
INSERT INTO department (id, code, name)
SELECT gen_random_uuid(),
       UPPER(REGEXP_REPLACE(TRIM(department), '[^a-zA-Z0-9]+', '_', 'g')),
       TRIM(department)
  FROM (SELECT DISTINCT department FROM app_user WHERE department IS NOT NULL AND TRIM(department) <> '') AS d
ON CONFLICT (code) DO NOTHING;

UPDATE app_user u
   SET department_id = d.id
  FROM department d
 WHERE d.name = TRIM(u.department);

-- Carry the existing sign-in details across. SAML_ENTRA becomes ENTRA_ID.
UPDATE app_user u
   SET auth_provider = CASE WHEN link.provider = 'SAML_ENTRA' THEN 'ENTRA_ID' ELSE link.provider END,
       external_identity_id = CASE WHEN link.provider = 'LOCAL' THEN NULL ELSE link.external_id END
  FROM (SELECT DISTINCT ON (user_id) user_id, provider, external_id
          FROM identity_link
         ORDER BY user_id, linked_at) AS link
 WHERE link.user_id = u.id;

UPDATE app_user u
   SET auth_provider = CASE WHEN u.primary_auth_source = 'SAML_ENTRA' THEN 'ENTRA_ID' ELSE 'LOCAL' END
 WHERE u.auth_provider IS NULL;

UPDATE app_user u
   SET password_hash = c.password_hash,
       password_updated_at = c.password_updated_at,
       must_change_password = c.must_change_password,
       failed_login_attempts = c.failed_attempts,
       locked_until = c.locked_until
  FROM local_credential c
 WHERE c.user_id = u.id;

ALTER TABLE app_user
    DROP COLUMN department,
    DROP COLUMN primary_auth_source,
    ALTER COLUMN auth_provider SET NOT NULL;

ALTER TABLE app_user
    ADD CONSTRAINT app_user_auth_provider_check CHECK (auth_provider IN ('LOCAL', 'ENTRA_ID')),
    -- A local account must carry a password; a directory account must never carry one. Entra
    -- passwords are the directory's business and are never stored here.
    ADD CONSTRAINT app_user_local_password_check CHECK (
        (auth_provider = 'LOCAL' AND password_hash IS NOT NULL)
        OR (auth_provider <> 'LOCAL' AND password_hash IS NULL)),
    -- A federated account is identified by its stable directory id, not by its email address.
    ADD CONSTRAINT app_user_external_identity_check CHECK (
        auth_provider = 'LOCAL' OR external_identity_id IS NOT NULL);

CREATE UNIQUE INDEX app_user_identity_key ON app_user (auth_provider, external_identity_id)
    WHERE external_identity_id IS NOT NULL;

CREATE INDEX app_user_status_idx ON app_user (status);
CREATE INDEX app_user_auth_provider_idx ON app_user (auth_provider);
CREATE INDEX app_user_external_identity_idx ON app_user (external_identity_id);
CREATE INDEX app_user_department_idx ON app_user (department_id);
CREATE INDEX app_user_created_at_idx ON app_user (created_at DESC);

-- The manager reference could not be added before app_user existed in its final shape.
ALTER TABLE department
    ADD CONSTRAINT department_manager_fk FOREIGN KEY (manager_id)
        REFERENCES app_user (id) ON DELETE SET NULL;

DROP TABLE identity_link;
DROP TABLE local_credential;

CREATE TABLE user_group (
    user_id  UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    group_id UUID        NOT NULL REFERENCES app_group (id) ON DELETE CASCADE,
    source   VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by UUID        REFERENCES app_user (id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, group_id),
    CONSTRAINT user_group_source_check CHECK (source IN ('MANUAL', 'DERIVED'))
);

CREATE INDEX user_group_group_idx ON user_group (group_id);

-- role_assignment is the join between users and roles; name it for what it is.
ALTER TABLE role_assignment RENAME TO user_role;
ALTER INDEX role_assignment_pkey RENAME TO user_role_pkey;
ALTER INDEX role_assignment_user_idx RENAME TO user_role_user_idx;
ALTER TABLE user_role RENAME CONSTRAINT role_assignment_unique TO user_role_unique;
ALTER TABLE user_role RENAME CONSTRAINT role_assignment_source_check TO user_role_source_check;

CREATE INDEX user_role_role_idx ON user_role (role_id);

-- =================================================================================================
-- Approval routing
-- =================================================================================================

CREATE TABLE approval_rule (
    id                 UUID         PRIMARY KEY,
    code               VARCHAR(64)  NOT NULL UNIQUE,
    name               VARCHAR(200) NOT NULL,
    description        TEXT,
    evaluation_order   INTEGER      NOT NULL DEFAULT 100,
    -- Matching: every populated column must match for the rule to apply.
    channel_id         UUID         REFERENCES channel (id) ON DELETE CASCADE,
    department_id      UUID         REFERENCES department (id) ON DELETE CASCADE,
    min_priority       VARCHAR(16),
    -- Outcome: exactly one of the three approver sources.
    approver_group_id  UUID         REFERENCES app_group (id) ON DELETE RESTRICT,
    approver_role_id   UUID         REFERENCES role (id) ON DELETE RESTRICT,
    approver_user_id   UUID         REFERENCES app_user (id) ON DELETE RESTRICT,
    mode               VARCHAR(16)  NOT NULL DEFAULT 'ANY_ONE',
    required_approvals INTEGER      NOT NULL DEFAULT 1,
    sla_hours          INTEGER      NOT NULL DEFAULT 24,
    enabled            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by         UUID         REFERENCES app_user (id) ON DELETE SET NULL,
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by         UUID         REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT approval_rule_mode_check CHECK (mode IN ('ANY_ONE', 'ALL', 'SEQUENTIAL')),
    CONSTRAINT approval_rule_priority_check CHECK (
        min_priority IS NULL OR min_priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT approval_rule_target_check CHECK (
        (approver_group_id IS NOT NULL)::int
        + (approver_role_id IS NOT NULL)::int
        + (approver_user_id IS NOT NULL)::int = 1)
);

CREATE INDEX approval_rule_order_idx ON approval_rule (evaluation_order) WHERE enabled;

COMMENT ON TABLE approval_rule IS
    'Declarative routing: which approvers a post goes to, in what mode, with what deadline.';

-- An approval_decision only ever recorded a human verdict. The workflow also needs to record
-- assignment, escalation and withdrawal, so the table becomes the log of every action on a request.
ALTER TABLE approval_decision RENAME TO approval_action;
ALTER TABLE approval_action RENAME COLUMN decision TO action;
ALTER TABLE approval_action RENAME COLUMN decided_by TO actor_id;
ALTER TABLE approval_action RENAME COLUMN decided_at TO performed_at;
ALTER TABLE approval_action RENAME COLUMN comment TO note;
ALTER INDEX approval_decision_request_idx RENAME TO approval_action_request_idx;
ALTER TABLE approval_action RENAME CONSTRAINT approval_decision_pkey TO approval_action_pkey;

ALTER TABLE approval_action DROP CONSTRAINT approval_decision_check;
ALTER TABLE approval_action
    ALTER COLUMN approval_step_id DROP NOT NULL,
    ADD CONSTRAINT approval_action_check CHECK (action IN (
        'SUBMITTED', 'ASSIGNED', 'REASSIGNED', 'APPROVE', 'REJECT', 'REQUEST_CHANGES',
        'ESCALATED', 'WITHDRAWN', 'EXPIRED'));

CREATE INDEX approval_action_actor_idx ON approval_action (actor_id, performed_at DESC);

-- V4 left the references to post_version with the default NO ACTION, which made the cascade chain
-- from post unfinishable: deleting a post cascaded to its versions and then hit these. A post that
-- cannot be deleted is a retention policy that cannot run, so both follow the post.
ALTER TABLE approval_action
    DROP CONSTRAINT approval_decision_post_version_id_fkey,
    ADD CONSTRAINT approval_action_post_version_fk FOREIGN KEY (post_version_id)
        REFERENCES post_version (id) ON DELETE CASCADE;

ALTER TABLE approval_request
    DROP CONSTRAINT approval_request_post_version_id_fkey,
    ADD CONSTRAINT approval_request_post_version_fk FOREIGN KEY (post_version_id)
        REFERENCES post_version (id) ON DELETE CASCADE;

CREATE TABLE sla_record (
    id                  UUID        PRIMARY KEY,
    approval_request_id UUID        NOT NULL UNIQUE REFERENCES approval_request (id) ON DELETE CASCADE,
    post_id             UUID        NOT NULL REFERENCES post (id) ON DELETE CASCADE,
    approval_rule_id    UUID        REFERENCES approval_rule (id) ON DELETE SET NULL,
    target_hours        INTEGER     NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL,
    due_at              TIMESTAMPTZ NOT NULL,
    warning_at          TIMESTAMPTZ NOT NULL,
    warned_at           TIMESTAMPTZ,
    breached_at         TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    state               VARCHAR(16) NOT NULL DEFAULT 'ON_TRACK',
    escalation_level    INTEGER     NOT NULL DEFAULT 0,
    resolution_seconds  BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sla_record_state_check CHECK (state IN ('ON_TRACK', 'WARNING', 'BREACHED', 'MET', 'MISSED'))
);

CREATE INDEX sla_record_open_idx ON sla_record (due_at) WHERE completed_at IS NULL;
CREATE INDEX sla_record_post_idx ON sla_record (post_id);

COMMENT ON TABLE sla_record IS
    'One row per review round: the deadline it was given and what actually happened to it.';

-- =================================================================================================
-- Governance
-- =================================================================================================

-- Append-only. Audit rows outlive the objects they describe, so nothing here cascades: an actor
-- cannot be deleted while their actions are on record, and the display fields are denormalised so
-- the row still reads correctly after a user is anonymised.
CREATE TABLE audit_log (
    id             UUID         PRIMARY KEY,
    occurred_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actor_user_id  UUID         REFERENCES app_user (id) ON DELETE RESTRICT,
    actor_display  VARCHAR(240) NOT NULL,
    actor_type     VARCHAR(24)  NOT NULL DEFAULT 'USER',
    auth_provider  VARCHAR(24),
    action         VARCHAR(96)  NOT NULL,
    entity_type    VARCHAR(64)  NOT NULL,
    entity_id      UUID,
    outcome        VARCHAR(16)  NOT NULL DEFAULT 'SUCCESS',
    reason         TEXT,
    ip_address     VARCHAR(64),
    user_agent     VARCHAR(512),
    correlation_id VARCHAR(64),
    session_id     VARCHAR(128),
    payload        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    prev_hash      VARCHAR(64),
    hash           VARCHAR(64),
    CONSTRAINT audit_log_actor_type_check CHECK (actor_type IN ('USER', 'SYSTEM', 'SERVICE_ACCOUNT')),
    CONSTRAINT audit_log_outcome_check CHECK (outcome IN ('SUCCESS', 'FAILURE', 'DENIED'))
);

CREATE INDEX audit_log_occurred_idx ON audit_log (occurred_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX audit_log_action_idx ON audit_log (action, occurred_at DESC);
CREATE INDEX audit_log_payload_idx ON audit_log USING gin (payload);

COMMENT ON TABLE audit_log IS
    'Append-only record of who did what. No cascade deletes: an audit row outlives its subject.';

-- The transactional outbox. A row is written in the same transaction as the change that caused it,
-- and a worker sends it afterwards.
CREATE TABLE email_log (
    id                  UUID         PRIMARY KEY,
    to_address          VARCHAR(320) NOT NULL,
    cc_addresses        VARCHAR(2000),
    recipient_user_id   UUID         REFERENCES app_user (id) ON DELETE SET NULL,
    template_code       VARCHAR(96)  NOT NULL,
    subject             VARCHAR(400) NOT NULL,
    model               JSONB        NOT NULL DEFAULT '{}'::jsonb,
    locale              VARCHAR(16)  NOT NULL DEFAULT 'tr-TR',
    status              VARCHAR(16)  NOT NULL DEFAULT 'QUEUED',
    attempts            INTEGER      NOT NULL DEFAULT 0,
    next_attempt_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_error          TEXT,
    -- Makes a retried job unable to send the same notification twice.
    dedupe_key          VARCHAR(200) NOT NULL UNIQUE,
    related_entity_type VARCHAR(64),
    related_entity_id   UUID,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    sent_at             TIMESTAMPTZ,
    CONSTRAINT email_log_status_check CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'))
);

-- The dispatcher's claim query: oldest due work first, skipping rows another worker holds.
CREATE INDEX email_log_pending_idx ON email_log (next_attempt_at)
    WHERE status IN ('QUEUED', 'SENDING');
CREATE INDEX email_log_created_idx ON email_log (created_at DESC);

CREATE TABLE retention_policy (
    id          UUID         PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    entity_type VARCHAR(64)  NOT NULL,
    condition   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    retain_days INTEGER      NOT NULL,
    action      VARCHAR(16)  NOT NULL,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    -- A retention job is destructive, so it starts life reporting what it would delete.
    dry_run     BOOLEAN      NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by  UUID         REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT retention_policy_action_check CHECK (action IN ('DELETE', 'ANONYMISE', 'ARCHIVE')),
    CONSTRAINT retention_policy_days_check CHECK (retain_days > 0)
);

-- app_setting was the platform placeholder; SystemSetting is the entity it becomes.
ALTER TABLE app_setting RENAME TO system_setting;
ALTER TABLE system_setting RENAME COLUMN key TO code;
ALTER INDEX app_setting_pkey RENAME TO system_setting_pkey;

ALTER TABLE system_setting
    ADD COLUMN data_type VARCHAR(16) NOT NULL DEFAULT 'JSON',
    ADD COLUMN editable  BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD CONSTRAINT system_setting_updated_by_fk FOREIGN KEY (updated_by)
        REFERENCES app_user (id) ON DELETE SET NULL;

CREATE INDEX system_setting_category_idx ON system_setting (category);

-- AIAnalysis is the entity name; ai_review was the working title.
ALTER TABLE ai_review RENAME TO ai_analysis;
ALTER TABLE ai_analysis RENAME CONSTRAINT ai_review_pkey TO ai_analysis_pkey;
ALTER TABLE ai_analysis RENAME CONSTRAINT ai_review_status_check TO ai_analysis_status_check;
ALTER TABLE ai_analysis RENAME CONSTRAINT ai_review_risk_check TO ai_analysis_risk_check;
ALTER INDEX ai_review_post_idx RENAME TO ai_analysis_post_idx;

ALTER TABLE ai_finding RENAME COLUMN ai_review_id TO ai_analysis_id;
ALTER INDEX ai_finding_review_idx RENAME TO ai_finding_analysis_idx;

-- =================================================================================================
-- Indexes the read paths depend on
-- =================================================================================================

CREATE INDEX post_created_at_idx ON post (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX post_submitted_at_idx ON post (submitted_at DESC) WHERE submitted_at IS NOT NULL;
CREATE INDEX post_channel_idx ON post (channel_id) WHERE deleted_at IS NULL;
CREATE INDEX approval_request_submitted_idx ON approval_request (requested_at DESC);
CREATE INDEX approval_step_assignee_open_idx ON approval_step (assignee_id) WHERE status = 'PENDING';
CREATE INDEX notification_created_idx ON notification (created_at DESC);

-- =================================================================================================
-- Reference data
--
-- Roles and their permissions were seeded in V3. What follows is organisational reference data and
-- default policy — no user accounts, and no credentials of any kind.
-- =================================================================================================

INSERT INTO department (id, code, name, description) VALUES
    (gen_random_uuid(), 'MARKETING', 'Marketing', 'Brand, campaigns and content.'),
    (gen_random_uuid(), 'MARKETING_COMMS', 'Marketing Communications', 'Corporate communications and approvals.'),
    (gen_random_uuid(), 'SALES', 'Sales', 'Field and inside sales.'),
    (gen_random_uuid(), 'PRODUCT', 'Product', 'Product management and enablement.'),
    (gen_random_uuid(), 'IT_GOVERNANCE', 'IT Governance', 'Platform administration and compliance.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app_group (id, code, name, description) VALUES
    (gen_random_uuid(), 'CONTENT_APPROVERS', 'Content approvers',
     'Reviews corporate content before publication.'),
    (gen_random_uuid(), 'BRAND_GUARDIANS', 'Brand guardians',
     'Consulted on brand-sensitive material.')
ON CONFLICT (code) DO NOTHING;

-- Default routing: everything goes to whoever holds the approver role, one approval, one day.
INSERT INTO approval_rule (id, code, name, description, evaluation_order, approver_role_id, mode,
                           required_approvals, sla_hours)
SELECT gen_random_uuid(), 'DEFAULT', 'Default approval route',
       'Applies when no more specific rule matches.', 1000, r.id, 'ANY_ONE', 1, 24
  FROM role r WHERE r.code = 'APPROVER'
ON CONFLICT (code) DO NOTHING;

INSERT INTO approval_rule (id, code, name, description, evaluation_order, min_priority,
                           approver_role_id, mode, required_approvals, sla_hours)
SELECT gen_random_uuid(), 'URGENT', 'Urgent content',
       'Urgent posts get a four-hour review window.', 100, 'URGENT', r.id, 'ANY_ONE', 1, 4
  FROM role r WHERE r.code = 'APPROVER'
ON CONFLICT (code) DO NOTHING;

INSERT INTO retention_policy (id, code, name, description, entity_type, condition, retain_days, action) VALUES
    (gen_random_uuid(), 'AUDIT_LOG', 'Audit trail retention',
     'Audit records are kept for three years, then archived.', 'audit_log', '{}'::jsonb, 1095, 'ARCHIVE'),
    (gen_random_uuid(), 'ABANDONED_DRAFTS', 'Abandoned drafts',
     'Drafts untouched for a year are deleted.', 'post',
     '{"status":["DRAFT"],"field":"updated_at"}'::jsonb, 365, 'DELETE'),
    (gen_random_uuid(), 'AI_PAYLOADS', 'AI prompt and response payloads',
     'Prompts and responses are kept for 30 days for debugging, then purged.', 'ai_analysis',
     '{}'::jsonb, 30, 'DELETE'),
    (gen_random_uuid(), 'SENT_EMAIL', 'Sent email records',
     'Delivery records are kept for 90 days.', 'email_log',
     '{"status":["SENT"]}'::jsonb, 90, 'DELETE')
ON CONFLICT (code) DO NOTHING;

INSERT INTO system_setting (code, value, category, description, data_type) VALUES
    ('workflow.default_sla_hours', '24'::jsonb, 'WORKFLOW',
     'Review window when no approval rule specifies one.', 'NUMBER'),
    ('workflow.sla_warning_threshold_percent', '80'::jsonb, 'WORKFLOW',
     'Point at which a review is flagged as approaching its deadline.', 'NUMBER'),
    ('workflow.expiry_days', '14'::jsonb, 'WORKFLOW',
     'A review round with no decision expires after this many days.', 'NUMBER'),
    ('content.max_attachments_per_post', '10'::jsonb, 'CONTENT',
     'Maximum attachments on a single post.', 'NUMBER'),
    ('notification.digest_time', '"09:00"'::jsonb, 'NOTIFICATION',
     'Local time the daily pending-approval digest is sent.', 'STRING'),
    ('ai.enabled', 'false'::jsonb, 'AI',
     'Whether content is sent to the AI provider for advisory review.', 'BOOLEAN')
ON CONFLICT (code) DO NOTHING;
