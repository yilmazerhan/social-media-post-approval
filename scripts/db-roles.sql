-- SECURITY.md §6 — Database privileges. Run once against a fresh database
-- (after `prisma migrate deploy` has created every table) as a superuser,
-- or adapt into your provisioning tooling. Two roles:
--
--   app         the runtime role DATABASE_URL points at. Full CRUD on
--               ordinary tables; append-only on AuditLog (no UPDATE/DELETE
--               grant exists — a bug or a compromised app process cannot
--               rewrite or erase audit history no matter what SQL it
--               issues); no UPDATE on PostVersion/ApprovalAction (both are
--               meant to be immutable — corrected by inserting a new row,
--               never by editing an old one) though it may still INSERT
--               and DELETE them (an app-level cascade, e.g. retention
--               deleting a Post, needs to remove its versions/actions too).
--   migrator    schema owner: DDL (`prisma migrate deploy`), and the one
--               role permitted to UPDATE/DELETE AuditLog rows at all — used
--               only by `scripts/backup.sh`'s retention-adjacent tooling,
--               never by the running application. A single-role deployment
--               (skip this script, point DATABASE_URL at the schema owner)
--               still works — SECURITY.md documents it as the accepted,
--               lower-assurance fallback, not a broken configuration.
--
-- Invoke with both passwords passed in, never hardcoded in this file:
--   psql -d content_approval \
--     -v app_password=<generated> -v migrator_password=<generated> \
--     -f scripts/db-roles.sql
-- (a `\set app_password ...` line *inside* this file would silently
-- override whatever `-v` passed on the command line — the two aren't
-- layered defaults, the later one simply wins — so no default is set
-- here at all; psql errors out with an "undefined variable" reference if
-- you forget one, rather than silently falling back to a value in this
-- file that everyone with repository read access can see.)

-- Idempotent by drop-then-create, so re-running this script (e.g. to
-- rotate a password) just works. `DROP OWNED BY` first: neither role owns
-- any object, but re-running this script has already granted them table
-- privileges, and a role holding a live grant can't be dropped until
-- that's revoked. Guarded by existence checks so a first run (nothing to
-- drop yet) doesn't error.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
    EXECUTE 'DROP OWNED BY app';
    EXECUTE 'DROP ROLE app';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'migrator') THEN
    EXECUTE 'DROP OWNED BY migrator';
    EXECUTE 'DROP ROLE migrator';
  END IF;
END
$$;

-- CREATE ROLE stays outside the DO block above: psql's `:'var'`
-- substitution doesn't reach inside a dollar-quoted string, so the
-- password couldn't be parameterized there.
CREATE ROLE app LOGIN PASSWORD :'app_password';
CREATE ROLE migrator LOGIN PASSWORD :'migrator_password';

GRANT USAGE ON SCHEMA public TO app, migrator;

-- migrator owns the schema and may do anything to it (DDL, and — the one
-- exception to "append-only" — fixing up AuditLog rows during an
-- exceptional, audited, out-of-band maintenance operation).
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO migrator;

-- app: full CRUD on every ordinary table...
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app;

-- ...except AuditLog, which never accepts UPDATE or DELETE from this role.
REVOKE UPDATE, DELETE ON "AuditLog" FROM app;

-- ...and PostVersion/ApprovalAction, which are insert/delete-only (no
-- UPDATE — corrections are a new row, never an edit of an old one).
REVOKE UPDATE ON "PostVersion", "ApprovalAction" FROM app;
