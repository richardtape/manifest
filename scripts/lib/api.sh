# shellcheck shell=bash
# THE control-plane client every demo script speaks through. Sourced, never executed.
#
# ONE copy. There were two — `scripts/demo.sh` and `scripts/lib/proof-app.sh` each
# defined key/api/field/environment — so every change to the API's paths, its origin or
# its headers had to be made twice, and the two would drift into proving different
# things (P5a Task 2). The generated client is the contract's client; this is the
# demos', and it is deliberately `curl` (P5a Decision 37).
#
# The caller sets, before calling anything:
#   CP_JAR      the Manifest session's cookie jar
#   PROJECT_ID  for `environment` only
# jq is not guaranteed on a UBC developer's Mac and C1 forbids a new prerequisite, so
# JSON is read with node, which the toolchain already requires.

# §21 (P5a Task 3): the console and the API share one origin, through the edge. Every
# resource path is under /v1 and the sign-in endpoints are under /auth, both on this
# origin. The host keychain trusts the platform CA, so curl needs no --cacert here —
# but a NODE process does not read the keychain (S7): anything that runs `node` against
# $API needs NODE_EXTRA_CA_CERTS, as the event-stream watcher's callers pass it.
ORIGIN="${MANIFEST_ORIGIN:-https://console.manifest.internal}"
API="$ORIGIN"

# Every mutating route requires an Idempotency-Key (D23.6) and answers 400 without
# one. A fresh key per call: replaying the same key returns the FIRST response.
key() { uuidgen | tr 'A-Z' 'a-z'; }

# A control-plane call as the person whose session is in $CP_JAR. $2 is the path AS THE
# CONTRACT SPELLS IT — `/v1/projects`, never `/projects` — so a script can be grepped
# against packages/contract/openapi.json. Every mutation carries a fresh
# Idempotency-Key (D23.6): replaying one returns the FIRST response.
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -b "$CP_JAR" -c "$CP_JAR" -X "$method" -H 'content-type: application/json')
  if [ "$method" != GET ]; then args+=(-H "idempotency-key: $(key)"); fi
  if [ -n "$body" ]; then args+=(-d "$body"); fi
  curl "${args[@]}" "$API$path"
}

field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a?.[k],j);if(v===undefined){console.error(s);process.exit(1)}console.log(typeof v==="object"?JSON.stringify(v):v)})' "$1"; }

json() { node -e 'console.log(JSON.stringify(process.argv[1]))' "$1"; }

environment() {
  api GET "/v1/projects/$PROJECT_ID?expand=environments" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const e=(j.environments??[]).find(x=>x.kind===process.argv[1]);if(!e){console.error(s);process.exit(1)}console.log(e.id)})' "$1"
}
