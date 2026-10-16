#!/bin/bash
# FE-32 sitting 1, [M4]: scripts are off. A probe package with a `postinstall` that writes /resolve/RAN, published to the
# THROWAWAY mirror (its scope local, the uplink refused), resolved through the real builder with Task 2's recipe and with
# scripts ON as the positive control, then `npm unpublish --force` and the throwaway's storage read. Removed on every path.
set -u
R=$1; mkdir -p "$R"; HERE=$(cd "$(dirname "$0")" && pwd)
T="bash $HERE/m3-throwaway.sh"; P="node $HERE/m2-export.mjs $R"
export FE32_WORK="$R/work" FE32_LOCAL_SCOPE=1
NONCE=$(date +%s | tail -c 7); PROBE_PKG="@manifest-probe/postinstall-$NONCE"
trap '$T down | tee -a "$R/down.txt"' EXIT
ask() { local out; out=$(curl -s -m 60 -w '\n%{http_code}' "http://127.0.0.1:7196/$1"); echo "curl /$1 -> $(echo "$out" | tail -1) $(echo "$out" | sed '$d' | tr -d '\n' | cut -c1-120)"; }
stamp() { echo "---- $* ($(date '+%H:%M:%S'))"; }
stamp "up, uplink refused, @manifest-probe/* local"; $T up http://127.0.0.1:9/
TOKEN=$(curl -s -X PUT "http://127.0.0.1:7196/-/user/org.couchdb.user:probe" -H 'content-type: application/json' \
  -d "{\"name\":\"probe\",\"password\":\"probe-$NONCE-pass\"}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).token||"")}catch{}})')
echo "token minted: $([ -n "$TOKEN" ] && echo yes || echo NO)"
PUB="$R/work/pkg"; rm -rf "$PUB"; mkdir -p "$PUB"
printf '//127.0.0.1:7196/:_authToken=%s\n' "$TOKEN" > "$R/work/npmrc-publish"
cat > "$PUB/package.json" <<JSON
{ "name": "$PROBE_PKG", "version": "1.0.0", "description": "FE-32 [M4] probe: a postinstall that leaves a marker",
  "scripts": { "postinstall": "node -e \"require('fs').writeFileSync('/resolve/RAN', 'ran')\"" } }
JSON
echo 'module.exports = 1' > "$PUB/index.js"
stamp publish; (cd "$PUB" && npm publish --registry http://127.0.0.1:7196/ --userconfig "$R/work/npmrc-publish" 2>&1 | grep -E 'npm (notice|error) (Publishing|name|version|total files|\+|code|[0-9])|^\+' | head -6)
ask "$PROBE_PKG"
echo "storage after publish: $(docker exec mf-fe32-verdaccio-probe sh -c 'find /verdaccio/storage/@manifest-probe -type f 2>/dev/null' | tr '\n' ' ')"
stamp "resolved with scripts OFF (Task 2's recipe)"; $P "m4:$PROBE_PKG@1.0.0"
stamp "positive control: scripts ON"; $P "m4on:$PROBE_PKG@1.0.0"
for c in "m4:$PROBE_PKG@1.0.0" "m4on:$PROBE_PKG@1.0.0"; do d="$R/$(echo "$c" | tr ':@/' '___')"; echo "$c: RAN $( [ -f "$d/out/resolve/RAN" ] && echo "PRESENT ($(cat "$d/out/resolve/RAN"))" || echo absent); exported $(find "$d/out" -type f | wc -l | tr -d ' ') files; lockfile has it: $(grep -c "postinstall-$NONCE" "$d/out/resolve/package-lock.json" 2>/dev/null)"; done
stamp "unpublish --force"; npm unpublish --force "$PROBE_PKG" --registry http://127.0.0.1:7196/ --userconfig "$R/work/npmrc-publish" 2>&1 | tail -2
ask "$PROBE_PKG"
echo "storage after unpublish: [$(docker exec mf-fe32-verdaccio-probe sh -c 'find /verdaccio/storage/@manifest-probe 2>/dev/null' | tr '\n' ' ')]"
$T logs 40 > "$R/verdaccio-m4.log"; rm -f "$R/work/npmrc-publish"; stamp done
