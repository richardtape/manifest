#!/bin/bash
# FE-32 sitting 1, [M2]: brackets m2-export.mjs with the mirror's own counts (tarballs, each asked package's last uplink fetch),
# the networks and every mf- container. Usage: bash m2-run.sh <results-dir> <case>...
set -u
R=$1; shift; mkdir -p "$R"
HERE=$(cd "$(dirname "$0")" && pwd)
snap() {
  echo "== $1 $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "tgz $(docker exec manifest-verdaccio sh -c 'find /verdaccio/storage -name "*.tgz" | wc -l' | tr -d ' ')"
  echo "packages $(docker exec manifest-verdaccio sh -c 'find /verdaccio/storage -name package.json | wc -l' | tr -d ' ')"
  for p in passport-saml @xmldom/xmldom xml-crypto xml-encryption xml2js debug passport-strategy xmlbuilder xpath escape-html sax ms cookie; do
    echo "fetched $p $(docker exec manifest-verdaccio sh -c "grep -o '\"fetched\":[0-9]*' /verdaccio/storage/$p/package.json | head -1")"
  done
  echo "networks $(docker network ls -q | wc -l | tr -d ' ')"
  echo "mf-containers [$(docker ps -a --filter name=mf- --format '{{.Names}}' | tr '\n' ' ')]"
}
snap before > "$R/mirror-before.txt"
node "$HERE/m2-export.mjs" "$R" "$@" 2>&1 | tee -a "$R/probe-stdout.txt"
snap after > "$R/mirror-after.txt"
diff "$R/mirror-before.txt" "$R/mirror-after.txt"
