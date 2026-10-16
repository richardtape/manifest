#!/bin/bash
# FE-32 sitting 1, [M3] (i), (ii), (iv) and [M4], against the THROWAWAY mirror of m3-throwaway.sh, through the real builder
# (m2-export.mjs, pointed at `mf-verdaccio-probe`). The throwaway is removed at the end, on every path.
# Usage: bash m3-run.sh <results-dir>
set -u
R=$1; mkdir -p "$R"; HERE=$(cd "$(dirname "$0")" && pwd)
T="bash $HERE/m3-throwaway.sh"; P="node $HERE/m2-export.mjs $R"
export FE32_WORK="$R/work"
NONCE=$(date +%s | tail -c 7)
NOSUCH="manifest-no-such-package-$NONCE"
PROBE_PKG="@manifest-probe/postinstall-$NONCE"
trap '$T down | tee -a "$R/down.txt"' EXIT
ask() { # what the throwaway itself answers for a package document: the status, and its body's first 160 characters
  local out; out=$(curl -s -m 120 -w '\n%{http_code} %{time_total}s' "http://127.0.0.1:7196/$1")
  echo "curl /$1 -> $(echo "$out" | tail -1) $(echo "$out" | sed '$d' | tr -d '\n' | cut -c1-160)"
}
stamp() { echo "---- $* ($(date '+%H:%M:%S'))"; }

export FE32_PHASE=refused; stamp "up, uplink refused (127.0.0.1:9)"; $T up http://127.0.0.1:9/
stamp "seed marked (metadata only) and ms (metadata and tarballs) from the live mirror"; $T seed marked ms
$T ls | sed 's/^/  /'
stamp "(i)/(ii)/(iv) as the throwaway answers them, uplink refused"
ask left-pad; ask "$NOSUCH"; ask marked; ask ms
stamp "(i) left-pad@1.3.0, never cached";               $P probe:left-pad@1.3.0
stamp "(ii) $NOSUCH@1.0.0, cannot exist";                $P "probe:$NOSUCH@1.0.0"
stamp "(iv) marked@999.0.0, cached, never published";    $P probe:marked@999.0.0
stamp "(iv) ms@999.0.0";                                  $P probe:ms@999.0.0
stamp "(iv) positive: ms@2.1.3 served from the seeded storage, uplink down"; $P min:ms@2.1.3
$T logs 30 > "$R/verdaccio-refused.log"

export FE32_PHASE=dns; stamp "uplink a name that does not resolve (registry.npmjs.invalid)"; $T uplink http://registry.npmjs.invalid/
ask left-pad; ask "$NOSUCH"
stamp "(i) DNS: left-pad@1.3.0";  $P probe:left-pad@1.3.0
stamp "(ii) DNS: $NOSUCH@1.0.0";  $P "probe:$NOSUCH@1.0.0"
$T logs 30 > "$R/verdaccio-dns.log"

export FE32_PHASE=online; stamp "uplink REACHABLE (https://registry.npmjs.org/) — what a registry that has no such name answers"; $T uplink https://registry.npmjs.org/
ask "$NOSUCH"
stamp "(ii) online: $NOSUCH@1.0.0"; $P "probe:$NOSUCH@1.0.0"
$T logs 30 > "$R/verdaccio-online.log"

stamp "[M4] uplink refused again; a user, then $PROBE_PKG published"; $T uplink http://127.0.0.1:9/
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
(cd "$PUB" && npm publish --registry http://127.0.0.1:7196/ --userconfig "$R/work/npmrc-publish" 2>&1 | tail -3)
ask "$PROBE_PKG"
stamp "[M4] resolved with scripts OFF (Task 2's recipe)"; $P "m4:$PROBE_PKG@1.0.0"
stamp "[M4] positive control: the same with scripts ON"; $P "m4on:$PROBE_PKG@1.0.0"
for c in "m4:$PROBE_PKG@1.0.0" "m4on:$PROBE_PKG@1.0.0"; do d="$R/$(echo "$c" | tr ':@/' '___')"; echo "$c: RAN $( [ -f "$d/out/resolve/RAN" ] && echo PRESENT || echo absent); exported $(find "$d/out" -type f | wc -l | tr -d ' ') files"; done
stamp "[M4] unpublish --force"
npm unpublish --force "$PROBE_PKG" --registry http://127.0.0.1:7196/ --userconfig "$R/work/npmrc-publish" 2>&1 | tail -2
ask "$PROBE_PKG"
echo "storage after unpublish: $(docker exec mf-fe32-verdaccio-probe sh -c 'ls /verdaccio/storage/@manifest-probe 2>/dev/null | wc -l' | tr -d ' ') entries under @manifest-probe; tgz $(docker exec mf-fe32-verdaccio-probe sh -c 'find /verdaccio/storage/@manifest-probe -name "*.tgz" 2>/dev/null | wc -l' | tr -d ' ')"
$T logs 40 > "$R/verdaccio-m4.log"
rm -f "$R/work/npmrc-publish"
stamp done
