#!/usr/bin/env bash
# ssp_ro, its grants, and the constraint that makes §9's fail-open row
# unrepresentable. Idempotent, runs on every `make up`.
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

psql_idp() {
  docker exec -i -e PGOPTIONS="-c manifest.ssp_ro_password=${SSP_RO_PASSWORD}" \
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
