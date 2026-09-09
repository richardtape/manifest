#!/usr/bin/env bash
# Make the running edge match infra/caddy/Caddyfile.
#
# The Caddyfile is bind-mounted read-only and Caddy reads it ONCE, at container
# start. `docker compose up -d` sees no change to the service definition when
# only the file's CONTENT changed, so it does not recreate the container and the
# edit has no effect — silently. Measured 2026-09-08 while adding the IdP site
# block: `make up` reported success and the wildcard kept answering.
#
# The reload is CONDITIONAL, on a hash kept in the edge's own data volume,
# because `caddy reload` replaces the WHOLE config and therefore discards the
# runtime routes the driver added through the admin API (P3 recorded this; the
# control plane re-applies them on edge start). An unconditional reload would
# make every `make up` drop the routes of a running platform.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILE="$ROOT/infra/caddy/Caddyfile"
MARKER=/data/.caddyfile-sha256

docker inspect manifest-caddy >/dev/null 2>&1 || exit 0

want=$(shasum -a 256 "$FILE" | awk '{print $1}')
have=$(docker exec manifest-caddy cat "$MARKER" 2>/dev/null || true)

[ "$want" = "$have" ] && exit 0

echo "  Caddyfile changed — reloading the edge (runtime routes are re-applied by the control plane)"
docker exec manifest-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec manifest-caddy sh -c "printf '%s' '$want' > $MARKER"
