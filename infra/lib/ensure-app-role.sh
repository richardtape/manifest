#!/usr/bin/env bash
# manifest_app — the role the CONTROL PLANE connects as. Idempotent, runs on
# every `make up`, the same shape as ensure-idp-sql.sh's ssp_ro.
#
# WHY THIS EXISTS. §20 requires the events table to be append-only "by grant,
# not by convention: the application role holds no UPDATE or DELETE privilege on
# it". Until 2026-09-09 the control plane connected as `manifest`, which is
# POSTGRES_USER and therefore a SUPERUSER — and a superuser bypasses every
# privilege check there is. Measured on this machine before writing this file:
#
#   CREATE TABLE ctl_probe(x int);
#   REVOKE UPDATE, DELETE ON ctl_probe FROM manifest;   -> REVOKE
#   UPDATE ctl_probe SET x = 2;                          -> UPDATE 1
#   DELETE FROM ctl_probe;                               -> DELETE 1
#
# So §20's control was not merely missing, it was unimplementable: any REVOKE
# written against the old connection would have read exactly like a control and
# done nothing. `manifest` keeps its superuser role and stays what migrations and
# the test harness use; the application gets this one, which owns nothing.
#
# WHY `events` LIVES IN ITS OWN SCHEMA. Every blanket grant below is scoped
# `IN SCHEMA public`, so none of them can reach `audit.events` — not this script,
# not a future one, not a `GRANT ... ON ALL TABLES` somebody adds in a year. The
# alternative was to grant everything on public and then revoke on one table by
# name, which converges only as long as every future author remembers the
# exception. The schema boundary makes the exception structural, which is what
# "by grant, not by convention" is actually asking for. The migration that
# creates `audit.events` owns its two grants, and they are SELECT and INSERT.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
. infra/lib/common.sh
[ -f .env ] && { set -a; . ./.env; set +a; }
MANIFEST_APP_PASSWORD="${MANIFEST_APP_PASSWORD:-change-me-locally}"

psql_control() {
  docker exec -i -e PGOPTIONS="-c manifest.app_password=${MANIFEST_APP_PASSWORD}" \
    manifest-postgres psql -v ON_ERROR_STOP=1 -U manifest -d manifest_control "$@"
}

psql_control <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'manifest_app') THEN
    EXECUTE format('CREATE ROLE manifest_app LOGIN PASSWORD %L', current_setting('manifest.app_password', true));
  ELSE
    EXECUTE format('ALTER ROLE manifest_app PASSWORD %L', current_setting('manifest.app_password', true));
  END IF;
END
$$;

-- No CREATEDB, no CREATEROLE, no SUPERUSER, and it owns nothing. Stated
-- positively because the whole point of the role is what it CANNOT do, and an
-- inherited attribute from some earlier run would be invisible otherwise.
ALTER ROLE manifest_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT CONNECT ON DATABASE manifest_control TO manifest_app;
GRANT USAGE ON SCHEMA public TO manifest_app;

-- The §6 tables. Read-write, because the control plane is a CRUD application over
-- them — this role is least-privilege about DDL and about the audit log, not
-- about ordinary business data.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO manifest_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO manifest_app;

-- Without these, every table a FUTURE migration adds is invisible to the
-- application until somebody re-runs this script, and the failure arrives as a
-- runtime "permission denied for table X" long after the migration looked fine.
-- ensure-idp-sql.sh carries the same line for ssp_ro, for the same reason.
ALTER DEFAULT PRIVILEGES FOR ROLE manifest IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO manifest_app;
ALTER DEFAULT PRIVILEGES FOR ROLE manifest IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO manifest_app;
SQL

echo "ensure-app-role: manifest_app present, granted on public, no reach into audit"
