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
COMPOSE_HINT='docker compose -f infra/compose.yaml -p manifest --env-file .env up -d --force-recreate caddy'

docker inspect manifest-caddy >/dev/null 2>&1 || exit 0

want=$(shasum -a 256 "$FILE" | awk '{print $1}')
have=$(docker exec manifest-caddy cat "$MARKER" 2>/dev/null || true)

[ "$want" = "$have" ] && exit 0

# THE EDGE MAY NOT BE ABLE TO SEE THE FILE AT ALL. A single-file bind mount is bound to
# the file's INODE, and an editor, a tool or `git checkout` that saves by writing a new
# file and renaming it over the old one leaves the container on the deleted inode —
# measured 2026-09-16 (P5a sitting 2, Docker Desktop 29.7.2): after such a save
# `/etc/caddy/Caddyfile` was "No such file or directory" inside `manifest-caddy`, and the
# reload below failed, so `make up` exited 1. (On a Linux daemon the container would go
# on reading the OLD content instead, which is worse.) So compare what the edge reads
# with what the host holds, and re-bind by restarting the edge when they differ. A
# restart drops the runtime routes exactly as a reload does, and Caddy reads the file
# as it starts, so no reload follows it.
seen=$(docker exec manifest-caddy sha256sum /etc/caddy/Caddyfile 2>/dev/null | awk '{print $1}' || true)
if [ "$seen" != "$want" ]; then
  echo "  the edge cannot see the current Caddyfile (a save replaced the file) — restarting it to re-bind the mount (runtime routes are re-applied by the control plane)"
  docker restart manifest-caddy >/dev/null
  for _ in $(seq 1 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' manifest-caddy)" = healthy ] && break
    sleep 1
  done
  seen=$(docker exec manifest-caddy sha256sum /etc/caddy/Caddyfile 2>/dev/null | awk '{print $1}' || true)
  if [ "$seen" != "$want" ]; then
    echo "  the edge still reads a different Caddyfile after a restart (want $want, edge has ${seen:-nothing}) — recreate it: $COMPOSE_HINT" >&2
    exit 1
  fi
  docker exec manifest-caddy sh -c "printf '%s' '$want' > $MARKER"
  exit 0
fi

echo "  Caddyfile changed — reloading the edge (runtime routes are re-applied by the control plane)"
docker exec manifest-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec manifest-caddy sh -c "printf '%s' '$want' > $MARKER"
