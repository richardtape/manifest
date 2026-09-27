#!/bin/bash
# run.sh <probe.mts> [args...] — runs a probe under Node 24 with the control plane's .ts modules importable by
# path: --experimental-transform-types (parameter properties, which strip-only refuses) and
# packages/github-fake/resolve-ts.mjs (a `./x.js` specifier resolves to `./x.ts` beside it). The environment is
# RUNBOOK's "Running the control plane" exports, because db/client.ts throws AT IMPORT without
# MANIFEST_DATABASE_URL and many modules import it; no probe writes the control database.
set -euo pipefail
PROBE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
shift
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$ROOT"
set -a; . ./.env; set +a
export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"
export MANIFEST_IDP_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_idp"
export NODE_EXTRA_CA_CERTS="$ROOT/infra/ca/manifest-root.crt"
exec node --no-warnings --experimental-transform-types --import ./packages/github-fake/resolve-ts.mjs "$PROBE" "$@"
