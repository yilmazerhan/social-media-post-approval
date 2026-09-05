-- V3 — identity and access.
--
-- One internal user, two ways of proving who you are (ARCHITECTURE.md section 5.1). Roles and
-- permissions are rows rather than code, so a new role is an INSERT and not a deployment
-- (section 6.1).

CREATE TABLE app_user (
    id                  UUID         PRIMARY KEY,
    email               VARCHAR(320) NOT NULL,
    username            VARCHAR(120),
    first_name          VARCHAR(120) NOT NULL,
    last_name           VARCHAR(120) NOT NULL,
    display_name        VARCHAR(240) NOT NULL,
    department          VARCHAR(160),
    job_title           VARCHAR(160),
    locale              VARCHAR(16)  NOT NULL DEFAULT 'tr-TR',
    timezone            VARCHAR(64)  NOT NULL DEFAULT 'Europe/Istanbul',
    status              VARCHAR(24)  NOT NULL,
    primary_auth_source VARCHAR(24)  NOT NULL,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT app_user_status_check CHECK (status IN ('ACTIVE', 'PENDING_ACTIVATION', 'DISABLED', 'LOCKED')),
    CONSTRAINT app_user_auth_source_check CHECK (primary_auth_source IN ('LOCAL', 'SAML_ENTRA'))
);

-- Case-insensitive uniqueness through an expression index rather than the citext type:
-- Hibernate's schema validation cannot recognise a domain type, and a functional index expresses
-- the same rule without tying the entity mapping to a PostgreSQL extension.
CREATE UNIQUE INDEX app_user_email_key ON app_user (LOWER(email)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX app_user_username_key ON app_user (LOWER(username)) WHERE username IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX app_user_display_name_idx ON app_user USING gin (display_name gin_trgm_ops);

-- The join between a login mechanism and the internal user. Matching is on external_id only:
-- email is mutable at the directory level and must never be an identity key.
CREATE TABLE identity_link (
    id            UUID         PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    provider      VARCHAR(24)  NOT NULL,
    external_id   VARCHAR(255) NOT NULL,
    subject_hint  VARCHAR(320),
    linked_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    CONSTRAINT identity_link_provider_check CHECK (provider IN ('LOCAL', 'SAML_ENTRA')),
    CONSTRAINT identity_link_unique UNIQUE (provider, external_id)
);

CREATE INDEX identity_link_user_idx ON identity_link (user_id);

CREATE TABLE local_credential (
    user_id              UUID         PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    password_hash        VARCHAR(255) NOT NULL,
    password_updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    must_change_password BOOLEAN      NOT NULL DEFAULT FALSE,
    failed_attempts      INTEGER      NOT NULL DEFAULT 0,
    locked_until         TIMESTAMPTZ
);

CREATE TABLE login_attempt (
    id                 UUID         PRIMARY KEY,
    user_id            UUID         REFERENCES app_user (id) ON DELETE SET NULL,
    username_attempted VARCHAR(320) NOT NULL,
    auth_method        VARCHAR(24)  NOT NULL,
    result             VARCHAR(32)  NOT NULL,
    ip_address         VARCHAR(64),
    user_agent         VARCHAR(512),
    attempted_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX login_attempt_user_time_idx ON login_attempt (user_id, attempted_at DESC);
CREATE INDEX login_attempt_ip_time_idx ON login_attempt (ip_address, attempted_at DESC);

CREATE TABLE role (
    id          UUID        PRIMARY KEY,
    code        VARCHAR(64) NOT NULL UNIQUE,
    name        VARCHAR(160) NOT NULL,
    description TEXT,
    is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
    is_default  BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE TABLE permission (
    id          UUID        PRIMARY KEY,
    code        VARCHAR(96) NOT NULL UNIQUE,
    domain      VARCHAR(48) NOT NULL,
    description TEXT
);

CREATE TABLE role_permission (
    role_id       UUID NOT NULL REFERENCES role (id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permission (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- scope_type/scope_id are GLOBAL everywhere in v1. They exist so that "approver for the LinkedIn
-- channel only" becomes a policy change rather than a migration of every assignment row.
CREATE TABLE role_assignment (
    id         UUID        PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    role_id    UUID        NOT NULL REFERENCES role (id) ON DELETE CASCADE,
    scope_type VARCHAR(24) NOT NULL DEFAULT 'GLOBAL',
    scope_id   UUID,
    source     VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    granted_by UUID        REFERENCES app_user (id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    CONSTRAINT role_assignment_source_check CHECK (source IN ('MANUAL', 'DERIVED')),
    CONSTRAINT role_assignment_unique UNIQUE (user_id, role_id, scope_type)
);

CREATE INDEX role_assignment_user_idx ON role_assignment (user_id);

-- ---------------------------------------------------------------------------------------------
-- Seed: the permission catalogue and the three roles of ARCHITECTURE.md section 6.2.
-- ADMIN is not a bypass flag; it is a role that happens to hold every permission, so admin actions
-- stay auditable and revocable like any other.
-- ---------------------------------------------------------------------------------------------

INSERT INTO permission (id, code, domain, description) VALUES
    (gen_random_uuid(), 'post:create',            'post',         'Create a draft post'),
    (gen_random_uuid(), 'post:read:own',          'post',         'Read own posts'),
    (gen_random_uuid(), 'post:read:assigned',     'post',         'Read posts assigned for review'),
    (gen_random_uuid(), 'post:read:all',          'post',         'Read every post'),
    (gen_random_uuid(), 'post:update:own',        'post',         'Edit own draft'),
    (gen_random_uuid(), 'post:update:any',        'post',         'Edit any draft'),
    (gen_random_uuid(), 'post:submit',            'post',         'Submit a post for approval'),
    (gen_random_uuid(), 'post:withdraw',          'post',         'Withdraw a post from review'),
    (gen_random_uuid(), 'post:delete:own',        'post',         'Delete own draft'),
    (gen_random_uuid(), 'post:delete:any',        'post',         'Delete any post'),
    (gen_random_uuid(), 'post:publish',           'post',         'Publish an approved post'),
    (gen_random_uuid(), 'post:schedule',          'post',         'Schedule an approved post'),
    (gen_random_uuid(), 'approval:read:assigned', 'approval',     'See approvals assigned to me'),
    (gen_random_uuid(), 'approval:read:all',      'approval',     'See every approval'),
    (gen_random_uuid(), 'approval:decide',        'approval',     'Approve, reject or request changes'),
    (gen_random_uuid(), 'approval:assign',        'approval',     'Assign approvers'),
    (gen_random_uuid(), 'approval:reassign',      'approval',     'Reassign an approval step'),
    (gen_random_uuid(), 'approval:escalate',      'approval',     'Escalate an approval'),
    (gen_random_uuid(), 'comment:create',         'comment',      'Comment on a post'),
    (gen_random_uuid(), 'comment:read',           'comment',      'Read comments'),
    (gen_random_uuid(), 'comment:delete:own',     'comment',      'Delete own comment'),
    (gen_random_uuid(), 'comment:delete:any',     'comment',      'Delete any comment'),
    (gen_random_uuid(), 'attachment:upload',      'attachment',   'Upload media'),
    (gen_random_uuid(), 'attachment:download',    'attachment',   'Download media'),
    (gen_random_uuid(), 'attachment:delete',      'attachment',   'Remove media'),
    (gen_random_uuid(), 'notification:read:own',  'notification', 'Read own notifications'),
    (gen_random_uuid(), 'ai:review:run',          'ai',           'Trigger an AI content check'),
    (gen_random_uuid(), 'ai:review:read',         'ai',           'Read AI findings'),
    (gen_random_uuid(), 'ai:finding:resolve',     'ai',           'Acknowledge or dismiss an AI finding'),
    (gen_random_uuid(), 'report:read',            'report',       'Read reports'),
    (gen_random_uuid(), 'audit:read',             'audit',        'Read the audit trail'),
    (gen_random_uuid(), 'user:read',              'admin',        'Read users'),
    (gen_random_uuid(), 'user:create',            'admin',        'Create users'),
    (gen_random_uuid(), 'user:update',            'admin',        'Update users'),
    (gen_random_uuid(), 'user:disable',           'admin',        'Disable users'),
    (gen_random_uuid(), 'role:read',              'admin',        'Read roles'),
    (gen_random_uuid(), 'role:manage',            'admin',        'Manage roles and permissions'),
    (gen_random_uuid(), 'settings:read',          'admin',        'Read settings'),
    (gen_random_uuid(), 'settings:manage',        'admin',        'Manage settings');

INSERT INTO role (id, code, name, description, is_system, is_default) VALUES
    (gen_random_uuid(), 'EMPLOYEE', 'Employee', 'Creates content and submits it for approval.', TRUE, TRUE),
    (gen_random_uuid(), 'APPROVER', 'Approver', 'Reviews assigned content and records decisions.', TRUE, FALSE),
    (gen_random_uuid(), 'ADMIN',    'Administrator', 'Administers users, roles and governance settings.', TRUE, FALSE);

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'EMPLOYEE' AND p.code IN (
    'post:create', 'post:read:own', 'post:update:own', 'post:submit', 'post:withdraw',
    'post:delete:own', 'comment:create', 'comment:read', 'comment:delete:own',
    'attachment:upload', 'attachment:download', 'attachment:delete',
    'notification:read:own', 'ai:review:run', 'ai:review:read', 'ai:finding:resolve');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code = 'APPROVER' AND p.code IN (
    'post:create', 'post:read:own', 'post:read:assigned', 'post:update:own', 'post:submit',
    'post:withdraw', 'post:delete:own', 'comment:create', 'comment:read', 'comment:delete:own',
    'comment:delete:any', 'attachment:upload', 'attachment:download', 'attachment:delete',
    'notification:read:own', 'ai:review:run', 'ai:review:read', 'ai:finding:resolve',
    'approval:read:assigned', 'approval:decide', 'approval:escalate', 'report:read');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p WHERE r.code = 'ADMIN';
