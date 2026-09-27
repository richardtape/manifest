#!/bin/bash
# m3-m5-two-origins.sh — [M3][M5] runs the probe with the environment RUNBOOK's "Running the control plane"
# exports, then prints what the IdP logged during it (SimpleSAMLphp's error page says only "Unhandled exception";
# the reason is in its log and nowhere else).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
cd "$ROOT"
set -a; . ./.env; set +a
export MANIFEST_IDP_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_idp"
# db/client.ts throws at import without it (sso/keypair.ts imports it); the probe never writes the control database.
export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"
export NODE_EXTRA_CA_CERTS="$ROOT/infra/ca/manifest-root.crt"
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
bash "$HERE/run.sh" "$HERE/m3-m5-two-origins.mts"
echo "--- the IdP's log since $since, lines naming the probe entity, an ACS, a logout or an error"
docker logs manifest-idp --since "$since" 2>&1 | grep -iE 'probe-origins|AssertionConsumer|logout|error|exception|warning' | sed -E 's/(SAMLRequest|SAMLResponse|Signature)=[^& ]+/\1=…/g' | cut -c1-300 | tail -40
