#!/usr/bin/env bash
# make seed — THE ONLY STEP THAT NEEDS NETWORK. Everything after this works
# offline, which is C1's claim and Task 13's assertion.
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

echo "1/6  .env"
if [ -f .env ]; then echo "     .env exists, leaving it alone"
else cp .env.example .env; echo "     created .env from .env.example"; fi
set -a; . ./.env; set +a

echo "2/6  building the platform images"
$COMPOSE build

# §13's gate integrity. Must run BEFORE any `compose up`: the registry
# bind-mounts token.crt, and Docker creates a directory at a missing bind source.
bash infra/lib/ensure-registry-auth.sh

echo "3/6  starting the registry and the mirror"
$COMPOSE up -d registry verdaccio postgres
# NOT `curl -sf`. The registry now requires a token, so /v2/ answers 401 and `-f`
# would fail — this loop would spin for ever and `make seed` would never finish.
# A 401 is itself proof the registry is up AND that token auth is configured.
until [ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_REGISTRY/v2/" 2>/dev/null)" != "000" ]; do sleep 1; done
until curl -sf "http://127.0.0.1:$PORT_VERDACCIO/-/ping" >/dev/null; do sleep 1; done

echo "4/6  mirroring base images into the local registry"
bash infra/seed/mirror-images.sh

echo "4b/6 warming the package mirror from the blueprint and fixture lockfiles"
# What makes an offline `npm install` possible. Every dependency closure is
# fetched once, through Verdaccio, so its TARBALLS are cached in its storage.
#
# DERIVED FROM THE LOCKFILES, not restated. The list here was `fastify`,
# `mongodb`, `zod` — hardcoded — so the moment a blueprint or fixture gained a
# dependency the offline build failed, and the symptom was an `npm ci` error
# deep inside the builder with the network already off. `node-ts-mongo` and the
# SAML fixture both need `passport-ubcshib`, which was not in that list.
#
# A FULL INSTALL, never `--package-lock-only`. Verdaccio caches a tarball when
# it is DOWNLOADED, and `--package-lock-only` resolves metadata without
# downloading anything — so it would leave the mirror holding package documents
# and no tarballs, which is indistinguishable from a warm mirror until the
# network goes away. Measured 2026-09-08: `find /verdaccio/storage -name '*.tgz'`
# is what tells the two apart.
#
# Into a TEMP DIRECTORY, never the source tree: a full install writes
# node_modules, and under `blueprints/*/skeleton/` or `fixtures/*/` that tree
# becomes part of the next build context.
for manifest in blueprints/*/skeleton/package.json fixtures/*/package.json; do
  [ -f "$manifest" ] || continue
  d=$(dirname "$manifest")
  echo "     $d"
  tmp=$(mktemp -d)
  cp "$manifest" "$tmp/package.json"
  [ -f "$d/package-lock.json" ] && cp "$d/package-lock.json" "$tmp/package-lock.json"
  (cd "$tmp" && npm install \
     --registry "http://127.0.0.1:$PORT_VERDACCIO" \
     --no-audit --no-fund --silent) || echo "     WARN: mirror warm failed for $d"
  rm -rf "$tmp"
done

echo "4c/6 pulling the vulnerability database"
# §12: `make seed` pulls the scanner database. This is the ONLY part of a scan that
# needs the network, and from here on `make doctor` reports its age. Grype is then
# run with GRYPE_DB_AUTO_UPDATE=false and GRYPE_DB_VALIDATE_AGE=false (build/scan.ts),
# so an offline build gets a stale-but-recorded result rather than a failure -- the
# behaviour §12 spends a paragraph on. Without the second, Grype refuses a database
# more than five days old outright (measured 2026-09-14).
docker volume create manifest-grype-db >/dev/null
docker run --rm -v manifest-grype-db:/db \
  -e GRYPE_DB_CACHE_DIR=/db anchore/grype:v0.118.0 db update

echo "5/6  minting the platform CA"
# Caddy publishes on 127.0.0.2:80/443, so the alias must exist before it starts —
# otherwise Docker refuses with "can't assign requested address". Calling the
# same guard `make up` uses is what removes S7's run-the-script-twice dance.
bash infra/lib/ensure-alias.sh
$COMPOSE up -d dns-containers dns-host caddy
mkdir -p infra/ca
until docker exec manifest-caddy test -f /data/caddy/pki/authorities/local/root.crt 2>/dev/null; do sleep 1; done
docker cp manifest-caddy:/data/caddy/pki/authorities/local/root.crt "$CA_FILE"
echo "     $CA_FILE"

echo "6/6  Ollama models"
# Large and network-dependent on a clean machine, so progress is shown rather
# than swallowed — S7 called this out as the one wholly manual-feeling wait.
while read -r m; do
  [ -z "$m" ] && continue
  case "$m" in \#*) continue;; esac
  if ollama list | awk 'NR>1{print $1}' | grep -qx "$m"; then
    echo "     $m already present"
  else
    echo "     pulling $m"; ollama pull "$m"
  fi
done < infra/models.txt

cat <<EOS

Seed complete. Two things still need you:

  1. make host-setup     three privileged steps; prompts for a password twice
  2. export NODE_EXTRA_CA_CERTS="\$PWD/$CA_FILE"    (add it to your shell profile)

Then:  make up && make doctor && make verify
EOS
