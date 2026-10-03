#!/usr/bin/env bash
# ssp_ro, its grants, and the constraint that makes §9's fail-open row
# unrepresentable — and ssp_store, the session store's own role (the faculty-ready
# plan's Task 9). Idempotent, runs on every `make up`.
#
# NOT an initdb script: those run once on an empty data directory, so an
# existing developer's volume would never see this. NOT the IdP's entrypoint
# either — S2's headline is that MANIFEST WRITES NO PHP, and that is worth
# keeping true.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
. infra/lib/common.sh
[ -f .env ] && { set -a; . ./.env; set +a; }
SSP_RO_PASSWORD="${SSP_RO_PASSWORD:-change-me-locally}"
SSP_STORE_PASSWORD="${SSP_STORE_PASSWORD:-change-me-locally}"

# The passwords travel as session settings, never on psql's command line or in its
# input — the same precedent for both roles.
psql_idp() {
  docker exec -i \
    -e PGOPTIONS="-c manifest.ssp_ro_password=${SSP_RO_PASSWORD} -c manifest.ssp_store_password=${SSP_STORE_PASSWORD}" \
    manifest-postgres psql -v ON_ERROR_STOP=1 -U manifest -d manifest_idp "$@"
}

# The IdP's entrypoint runs initMDSPdo.php at ITS start, which is not ordered
# against ours. Wait for the table rather than assuming it.
for i in $(seq 1 60); do
  if psql_idp -tAc "SELECT to_regclass('public.saml20_sp_remote')" 2>/dev/null | grep -q saml20_sp_remote; then
    break
  fi
  [ "$i" -eq 60 ] && { echo "ensure-idp-sql: saml20_sp_remote never appeared"; exit 1; }
  sleep 1
done

# A row written before this constraint existed makes the ALTER TABLE below fail
# with a Postgres error that names no row, and `make up` then dies with three
# lines of PL/pgSQL context. §9 calls such a row fail-open, so it is NOT deleted
# silently — deleting it would take a deployed app's sign-on away without
# saying so. Name it and stop.
violating=$(psql_idp -tAc "SELECT entity_id FROM saml20_sp_remote
  WHERE COALESCE(jsonb_array_length((entity_data::jsonb) -> 'attributes'), 0) = 0" || true)
if [ -n "$violating" ]; then
  echo "ensure-idp-sql: these saml20_sp_remote rows declare no attributes, which"
  echo "  core:AttributeLimit treats as 'release everything' (§9 fail-open):"
  echo "$violating" | sed 's/^/    /'
  echo "  Re-register the app, or remove the row:"
  echo "    docker exec manifest-postgres psql -U manifest -d manifest_idp \\"
  echo "      -c \"DELETE FROM saml20_sp_remote WHERE entity_id='<id>'\""
  exit 1
fi

psql_idp <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ssp_ro') THEN
    EXECUTE format('CREATE ROLE ssp_ro LOGIN PASSWORD %L', current_setting('manifest.ssp_ro_password', true));
  ELSE
    EXECUTE format('ALTER ROLE ssp_ro PASSWORD %L', current_setting('manifest.ssp_ro_password', true));
  END IF;
END
$$;

GRANT CONNECT ON DATABASE manifest_idp TO ssp_ro;
GRANT USAGE ON SCHEMA public TO ssp_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ssp_ro;
-- Easy to omit, and the failure is a runtime "permission denied" long after
-- seeding: initMDSPdo.php creates tables on a SimpleSAMLphp upgrade too (S2).
ALTER DEFAULT PRIVILEGES FOR ROLE manifest IN SCHEMA public GRANT SELECT ON TABLES TO ssp_ro;

-- §9: registration must reject a row whose attributes list is missing or empty.
-- This is the SECOND of the two independent reads of that rule; sso/ carries
-- the first. entity_data is TEXT, not jsonb (the handler hard-codes it), so the
-- constraint costs a cast per write — S2 priced that and it is acceptable.
--
-- COALESCE IS NOT DECORATION. `(entity_data::jsonb)->'attributes'` is SQL NULL
-- when the key is absent, jsonb_array_length(NULL) is NULL, and `NULL > 0` is
-- NULL — which a CHECK ACCEPTS. Without the COALESCE this constraint rejects
-- `"attributes": []` and waves through a row with no attributes key at all, and
-- core:AttributeLimit treats those two identically: no limit, everything
-- released (measured 2026-09-08). The fail-open row would still be writable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saml20_sp_remote_attributes_present') THEN
    ALTER TABLE public.saml20_sp_remote
      ADD CONSTRAINT saml20_sp_remote_attributes_present
      CHECK (COALESCE(jsonb_array_length((entity_data::jsonb) -> 'attributes'), 0) > 0);
  END IF;
END
$$;
SQL

# THE SESSION STORE'S OWN ROLE (the faculty-ready plan's Task 9). `store.sql.*` in
# config.php connected as `manifest` — POSTGRES_USER, so a SUPERUSER — and SimpleSAMLphp's
# SQL store created its two tables in `public`, where ssp_ro's blanket SELECT (above) read
# every live IdP session. Now `ssp_store` is an ordinary role that OWNS a schema of its
# own, and its search_path puts SimpleSAMLphp's own unqualified CREATE TABLE there on the
# store's first use; after that it needs only SELECT, INSERT, UPDATE and DELETE, which an
# owner has. ssp_ro holds no USAGE on that schema, and ssp_store no SELECT on public's
# tables — `make verify` asserts both directions.
psql_idp <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ssp_store') THEN
    EXECUTE format('CREATE ROLE ssp_store LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
                   current_setting('manifest.ssp_store_password', true));
  ELSE
    EXECUTE format('ALTER ROLE ssp_store LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
                   current_setting('manifest.ssp_store_password', true));
  END IF;
END
$$;

GRANT CONNECT ON DATABASE manifest_idp TO ssp_store;
CREATE SCHEMA IF NOT EXISTS ssp_store AUTHORIZATION ssp_store;
ALTER ROLE ssp_store SET search_path = ssp_store;
REVOKE ALL ON SCHEMA public FROM ssp_store;
SQL

# THE OLD COPIES IN `public`, dropped — and said, because dropping them ends every IdP
# session: everyone signs in to the IdP again. Present once, on the first `make up` after
# the move; again only if something wrote them back (a store.sql.username of `manifest`,
# which is the plan's negative control).
old=$(psql_idp -tAc "SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN ('simplesamlphp_kvstore', 'simplesamlphp_tableversion')")
if [ -n "$old" ]; then
  echo "ensure-idp-sql: dropping the IdP's old session tables in public ($old) — the store is"
  echo "  ssp_store's now (schema ssp_store), so every IdP session ends: sign in again."
  psql_idp -qc "DROP TABLE IF EXISTS public.simplesamlphp_kvstore, public.simplesamlphp_tableversion"
fi
