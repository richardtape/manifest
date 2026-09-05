#!/usr/bin/env bash
# Create SimpleSAMLphp's metadata tables using SSP'S OWN INITIALISER, then hand
# off to the stock entrypoint.
#
# WHY NOT A HAND-WRITTEN initdb/*.sql: P1 originally created saml20_sp_remote
# with columns (entityid, entitydata). That is SimpleSAMLphp 1.x's schema. 2.x's
# MetaDataStorageHandlerPdo queries `SELECT entity_id, entity_data`, so the table
# existed, the "SQL metadata table exists" check passed, and every metadata read
# threw. Measured 2026-09-05. bin/initMDSPdo.php is authoritative and moves with
# the SimpleSAMLphp version, so the schema cannot drift away from the code again.
# It is idempotent, and creates the kvstore the SQL session store needs too.
set -euo pipefail

for i in $(seq 1 60); do
  if php -r 'new PDO(getenv("SSP_DSN"), getenv("SSP_DB_USER"), getenv("SSP_DB_PASS"));' 2>/dev/null; then
    break
  fi
  [ "$i" -eq 60 ] && { echo "idp: database never became reachable"; exit 1; }
  sleep 1
done

php /var/simplesamlphp/bin/initMDSPdo.php

exec docker-php-entrypoint "$@"
